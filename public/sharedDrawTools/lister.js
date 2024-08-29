
// version 0.0.2 - apr 2024

/* global screen, IntersectionObserver, freepr, freezr */ // from system
/* global domainAppFromUrl, overlayUtils, convertDownloadedMessageToRecord, mergeMessageRecords  */ // from utils
/* global dg */ // from dgelements.js
/* from popupChromeExt - added a dummy */
/* global  collapseIfExpanded, expandSection */ // from drawUtils
/* global vState */ // from view.js
/* global convertMarkToSharable, resetVulogKeyWords, dateLatestMessageSorter, sortBycreatedDate, convertPasteToText, convertLogToMark, getParentWithClass, MCSS, markMsgHlightsAsMarked */ // from utils

// const SEARCH_COUNT = 40

const lister = {}
// Initialization and search
lister.setDivListeners = function () {
  const { divs } = vState
  if (!divs || !divs.searchBox || !divs.main || !divs.searchButton) {
    console.error('need divs for lister to work')
    return
  }
  divs.searchBox.onkeypress = function (evt) {
    if (evt.key === 'Enter') { evt.preventDefault() }
  }
  divs.searchBox.onkeyup = async function (e) {
    await lister.filterItemsInMainDivOrGetMore('searchChange')
  }
  divs.searchBox.onpaste = async function (e) {
    convertPasteToText(e)
    await lister.filterItemsInMainDivOrGetMore('searchChange')
  }
  divs.searchButton.onclick = async function (e) {
    await lister.filterItemsInMainDivOrGetMore('searchChange')
  }
  if (divs.dateFilter) {
    divs.dateFilter.onkeyup = async function (e) {
      if (e.key === 'Enter') {
        e.preventDefault()
        await lister.filterItemsInMainDivOrGetMore('searchChange')
        vState.calendar.hideCalendar()
        divs.dateFilter.blur()
      }
    }
  }
}
lister.getUrlParams = function () {
  const urlParams = (new URL(document.location)).searchParams
  const list = urlParams.get('view') || 'marks'

  const queryParams = { list }

  queryParams.words = urlParams.get('words') || null
  queryParams.starFilters = urlParams.get('stars') || null

  // for public and feeds
  queryParams.feed = urlParams.get('feed') || null
  queryParams.feedcode = urlParams.get('code') || null
  queryParams.dataOwner = urlParams.get('owner') || null
  // queryParams.notStarfilters = urlParams.get('notstars') || null
  // queryParams.startDate = urlParams.get('startdate') || null
  queryParams.date = urlParams.get('date') || null

  return queryParams
}
lister.setUrlParams = function () {
  // todo - add all queryParams to the url
}
lister.getQueryParams = function () {
  vState.queryParams.words = lister.getSearchBoxParams(vState.divs.searchBox)
  const readDate = vState.divs?.dateFilter?.value ? new Date(vState.divs.dateFilter.value) : null
  // if (readDate) readDate.setUTCHours(23,59,59,999)
  if (readDate) readDate.setDate(readDate.getDate() + 1)
  vState.queryParams.date = isNaN(readDate) ? null : readDate
  if (isNaN(readDate)) vState.divs.dateFilter.value = ''
  return vState.queryParams
  // vState.queryParams.filterStars shoudl already be set... but really should be moved here for consistency
}
lister.getSearchBoxParams = function (searchBox) {
  return searchBox.textContent || ''
}

// draw structure
lister.drawAllItemsForList = async function () {
  // called on load and also when new menu items are chosen
  const list = vState.queryParams.list
  const mainDiv = vState.divs.main
  mainDiv.innerHTML = ''
  
  window.scrollTo(0, 0)

  lister.createOuterDomStructure()
  lister.drawFilters()

  let gotErr = false

  vState.loadState.source = 'initialLoad'

  // populate marks to show some of the marks on history in any case
  if (!vState.marks && !vState.isPublicView) {
    vState.marks = lister.emptyStatsObj()
    vState.marks.lookups = {}
    
    try {
      await lister.getMoreAndUpdateCountStatsFor('marks')
    } catch (e) {
      console.warn('error in drawAllItemsForList ', e)
      gotErr = true
    }
  }

  if (vState[list]?.unfilteredItems && vState[list].unfilteredItems.length > 0) {
    if (list === 'tabs') console.error('snbh drawAllItemsForList')
    lister.drawCardsOnMainDiv(list, vState[list].unfilteredItems, mainDiv)
    vState.divs.spinner.style.display = 'none'
  } else if (!gotErr && vState[list] && list !== 'tabs' && vState[list].unfilteredItems.length === 0) {
    vState.divs.spinner.style.display = 'none'
    lister.endCard.showNoMore()
  } else if (!gotErr) {
    try {
      const newItems = await lister.getMoreItems()
      lister.drawCardsOnMainDiv(list, newItems, mainDiv)
      vState.divs.spinner.style.display = 'none'
    } catch (e) {
      console.warn('error in drawAllItemsForList ', e)
      gotErr = true
    }
  }
  if (gotErr) {
    vState.showWarning('There was a problem syncing with the server. Sorry.', 2000)
  } else {
    setTimeout(() => {
      lister.filterItemsInMainDivOrGetMore('initialLoad')
    }, 20)
  }
}
lister.emptyFlexBox = function () {
  return dg.div({ style: { display: 'flex', 'flex-wrap': 'wrap', 'justify-content': 'flex-start' } })
}
lister.endSpacer = function () {
  return dg.div({ style: { height: '300px', width: (document.body.getClientRects()[0].width - 100 + 'px'), 'min-height': '300px ' } })
}
lister.createOuterDomStructure = function () {
  const list = vState.queryParams.list
  const mainDiv = vState.divs.main
  mainDiv.innerHTML = ''

  if (list === 'marks' || list === 'history' || list === 'tabs' || list === 'messages' || list === 'publicmarks') {
    const outer = dg.div({ className: (vState.viewType === 'fullHeight' ? 'heightColumsGridOuter' : 'widthFlexGridOuter') }) // lister.emptyFlexBox()
    mainDiv.appendChild(outer)
    outer.appendChild(lister.endCard.create())
    outer.appendChild(lister.endSpacer())
  } else {
    // atlernate way of doing history or others
    // const outer = list === 'marks' ? lister.emptyFlexBox() : dg.div()
    // mainDiv.appendChild(outer)
    // mainDiv.appendChild(lister.endCard.create(vState))
  }
}
lister.endCard = {
  inited: false,
  endCardStyle: { display: 'none', margin: '50px 10px', 'text-align': 'center', cursor: 'pointer', 'border-radius': '5px', background: 'white', padding: '5px' },
  create: function () {
    const moreButt = dg.div({
      id: 'vulogMoreButt',
      style: lister.endCard.endCardStyle,
      onclick: async function (e) {
        lister.endCard.showLoading()
        await lister.filterItemsInMainDivOrGetMore('moreButt')
      }
    }, 'more')
    const observerOptions = {
      root: null,
      rootMargin: '0px',
      threshold: 0.1
    }
    const moreButtObserver = new IntersectionObserver(function () {
      if (lister.endCard.inited) lister.filterItemsInMainDivOrGetMore('auto')
      lister.endCard.inited = true
    }, observerOptions)
    moreButtObserver.observe(moreButt)
    lister.endCard.inited = false // ugly hack fix of loading triggering automatically on start

    const noMoreButt = dg.div({
      style: { display: 'none', margin: '50px 10px', 'text-align': 'center', 'border-radius': '5px', background: 'lightgrey', padding: '5px' }
    }, 'Nothing more to show.')

    const loadingButt = dg.div({ style: { width: '20px', margin: '50px 90px 10px' } }, smallSpinner() )
    //     const loadingButt = dg.div({ style: { width: '20px', margin: '50px 90px 10px' } }, dg.img({ src: (freezr.app?.isWebBased ? '/app_files/@public/info.freezr.public/public/static/ajaxloaderBig.gif' : '/freezr/static/ajaxloaderBig.gif') }))

    return dg.div({ style: { height: '200px', width: '200px', margin: '25px 15px 65px 15px', 'vertical-align': 'center', display: 'none' } },
      moreButt, noMoreButt, loadingButt)
  },
  showMore: function () {
    const list = vState.queryParams.list
    const moreButt = dg.el('vulogMoreButt', { clear: true, show: true })
    moreButt.appendChild(dg.div(
      dg.span('Searched back to '), dg.br(),
      dg.span(new Date(vState[list].dates.oldestModified).toDateString()), dg.br(),
      dg.span({ style: { color: 'blue' } }, ' Get More...')))
    const endCard = moreButt.parentElement
    endCard.style.display = 'block'
    moreButt.nextSibling.style.display = 'none' // 'nomore'
    moreButt.nextSibling.nextSibling.style.display = 'none' // loading
  },
  showNoMore: function () {
    const moreButt = dg.el('vulogMoreButt', { clear: true, hide: true })
    moreButt.style.display = 'none'
    const nomoreButt = moreButt.nextSibling
    let text = ''
    const list = vState.queryParams.list
    if (!vState[list].unfilteredItems || vState[list].unfilteredItems.length === 0) {
      switch (list) {
        case 'marks':
          text = "You don't have any bookmarks yet. To book mark a page, click the extention icon on the top right of your browser window and mark it with a star or an inbox."
          break
        case 'history':
          text = 'hiper.cards is not logging your browsing history. To log browsing history go to settings and enable that.'
          break
          case 'tabs':
            text = 'Tabs will be added here soon.'
            break
        case 'messages':
          text = vState.freezrMeta.userId ?
            'To send your bookmark as a message, click the hiper.cards icon on the top right of your browser window to see your Sharing options.' :
            'To be able to send and receive message, you need to log in to a CEPS compatible server. Go to Settings for more guidance.'
          break
        default:
          text = 'Nothing more to show !'
      }
    }
    nomoreButt.innerText = text || 'Nothing more to show!!'
    nomoreButt.style.display = 'block'
    moreButt.nextSibling.nextSibling.style.display = 'none' // loading

    const endCard = moreButt.parentElement
    endCard.style.display = 'block'
  },
  hide: function () {
    const moreButt = dg.el('vulogMoreButt', { clear: true, hide: true })
    // const endCard = moreButt.parentElement
    // endCard.style.display = 'none'
    if (moreButt) moreButt.nextSibling.style.display = 'none' // 'nomore'
    if (moreButt) moreButt.nextSibling.nextSibling.style.display = 'block' // loading
  },
  showLoading: function () {
    const moreButt = dg.el('vulogMoreButt')
    moreButt.style.display = 'none'
    moreButt.nextSibling.style.display = 'none' // 'nomore'
    moreButt.nextSibling.nextSibling.style.display = 'block' // loading
  }
}
lister.drawCardsOnMainDiv = function (list, items, mainDiv) {
  if (!items || items.length === 0) return

  const outer = mainDiv.firstChild

  if (list === 'marks') {
    outer.className = (vState.viewType === 'fullHeight') ? 'heightColumsGridOuter' : 'widthFlexGridOuter'
    const moreDiv = outer.lastChild.previousSibling
    items.forEach(alog => {
      const theMark = lister.drawmarkItem(alog, { tabtype: list })
      theMark.style.width = '0'
      theMark.style.margin = '0'
      theMark.firstChild.style.transform = 'rotateY(90deg)'
      outer.insertBefore(theMark, moreDiv)
    })
  } else if (list === 'publicmarks') {
    outer.className = (vState.viewType === 'fullHeight') ? 'heightColumsGridOuter' : 'widthFlexGridOuter'
    const moreDiv = outer.lastChild.previousSibling
    items.forEach(alog => {
      const theMark = lister.drawpublicmarkItem(alog, { tabtype: list })
      theMark.style.height = '0'
      // xx fullHeight
      theMark.style.margin = '0'
      theMark.firstChild.style.transform = 'rotateX(90deg)'
      outer.insertBefore(theMark, moreDiv)
    })
  } else if (list === 'messages') {
    // for all new messages, check if already drawn and if so merge, and if not draw
    outer.className = (vState.viewType === 'fullHeight') ? 'heightColumsGridOuter' : 'widthFlexGridOuter'
    const moreDiv = outer.lastChild.previousSibling
    items.forEach(alog => {
      const theMark = lister.drawMessageItem(alog, { tabtype: list })
      theMark.style.width = '0'
      theMark.style.margin = '0'
      theMark.firstChild.style.transform = 'rotateY(90deg)'
      outer.insertBefore(theMark, moreDiv)
    })
  } else if (list === 'history') {
    // console.log('drawCardsOnMainDiv history', { items })
    // 1. first organsie into structured list
    const structuredList = {}
    const allLogs = {}
    items.forEach(logItem => {  // add to allLogs
      if (logItem.tabid && logItem.purl) {
        allLogs[logItem.tabid + '_' + logItem.purl] = logItem
      } else {
        console.warn('missing tabid or purl in logItem', { logItem })
      }
    })// todo merge same purls
    items.forEach(logItem => {
      let currentRoot = structuredList
      if (logItem.referrerHistory && logItem.referrerHistory.length > 0) {
        const fullList = logItem.referrerHistory.reverse()
        const maintabIdPurl = logItem.tabid + '_' + logItem.purl
        const uniqueRefPurlIdHistory = []
        logItem.referrerHistory.forEach(tpo => {
          const thisTabIdPurl = tpo.tabid + '_' + tpo.refPurl
          if (!tpo.refPurl) console.warn('missing refPurl in referrerHistory', { tpo })
          if (tpo.refPurl && thisTabIdPurl !== maintabIdPurl && uniqueRefPurlIdHistory.indexOf(thisTabIdPurl) < 0) uniqueRefPurlIdHistory.push(thisTabIdPurl)
        })
        uniqueRefPurlIdHistory.push(maintabIdPurl)
        uniqueRefPurlIdHistory.forEach((tabIdPurlStr, i) => {
        // for (let i = uniqueRefPurlIdHistory.length - 1; i > -1; i--) {
        //   const tabIdPurlStr = uniqueRefPurlIdHistory[i]
          if (!currentRoot[tabIdPurlStr]) {
            let purl = tabIdPurlStr.split('_')
            purl.shift()
            purl = purl.join('_')
            currentRoot[tabIdPurlStr] = { tabIdPurlStr, purl, logItem: allLogs[tabIdPurlStr], forwardRefs: { }}
          } else {
            // onsole.log('current root exists for ', { tabIdPurlStr })
          }
          currentRoot = currentRoot[tabIdPurlStr].forwardRefs
        // }
        })
      } else if (logItem.purl) { // no referrer history
        const tabIdPurlStr = logItem.tabid + '_' + logItem.purl
        if (structuredList[tabIdPurlStr]) {
          if (structuredList[tabIdPurlStr].logItem) console.log('consider merging...', logItem._id, logItem.purl)
          if (!structuredList[tabIdPurlStr].logItem) structuredList[tabIdPurlStr].logItem = allLogs[logItem.tabid + '_' + logItem.purl]
        } else {
          structuredList[tabIdPurlStr] = { tabIdPurlStr, purl: logItem.purl, logItem: allLogs[tabIdPurlStr], forwardRefs: { }}
          // structuredList[logItem.purl] = { purl: logItem.purl, logItem: allLogs[logItem.purl], forwardRefs: { }}
        }
      } else {
        console.warn('missing purl in logItem', { logItem })
      }
    })

    console.log({ allLogs, structuredList })

    const NoLogItemList = []

    const moreDiv = outer.lastChild.previousSibling
    // outer.className = ''
    const addForwardsToList = function (currentRoot, list) {
      if (!currentRoot.logItem) { 
        currentRoot.tempId = 'tempId_' + Math.round(Math.random() * 1000, 0)
        NoLogItemList.push(currentRoot)
        if (!currentRoot.purl && currentRoot.tabIdPurlStr) {
          console.warn('snbh - no purl for currentRoot', { currentRoot })
          let newPurl = currentRoot.tabIdPurlStr.split('_')
          newPurl.shift()
          currentRoot.purl = newPurl.join('_')
        }
        const purl = currentRoot.purl
        if (currentRoot.purl) {
          list.push({
            title: 'temporary card - original card not found',
            purl:  currentRoot.purl,
            url:  currentRoot.purl,
            domainApp: domainAppFromUrl(currentRoot.purl),
            vCreated: new Date().getTime(),
            fj_local_temp_unique_id:  currentRoot.tempId 
          })
        } else {
          console.warn('no purl for currentRoot', { currentRoot })
        }
      } else {
        list.push(currentRoot.logItem)
      }
      if (currentRoot.forwardRefs) {
        for (const key of Object.keys(currentRoot.forwardRefs)) {
          addForwardsToList(currentRoot.forwardRefs[key], list)
        }
      }
      return list
    }
    const removeDuplicateTabidPurls = function (fullList) {
      fullList = fullList.sort(sortBycreatedDate)
      const newFullList = []
      const tabidPurls = []
      fullList.forEach((logItem, i) => {
        const duplicteIndex = newFullList.findIndex((item) => item.tabid === logItem.tabid && item.purl === logItem.purl)
        if (duplicteIndex < 0) {
          newFullList.push(logItem)
        } else {
          if (logItem.vCreated > newFullList[duplicteIndex].vCreated) {
            newFullList[duplicteIndex] = logItem
            //merge other fields too ??
          }
        }
      })
      return newFullList.sort(sortBycreatedDate)
    }
    for (const root of Object.keys(structuredList)) {
      let fullList = []
      addForwardsToList(structuredList[root], fullList)
      fullList = removeDuplicateTabidPurls(fullList)
      
      // const inner = dg.div({ className: (vState.viewType === 'fullHeight') ? 'heightColumsGridOuter' : 'widthFlexGridOuter', style: { 'border-bottom': '1px solid white'} })
      fullList.forEach((logItem, index) => {
        const theLogDiv = lister.drawlogItem(logItem, { tabtype: list })
        // inner.appendChild(theLogDiv)
        outer.insertBefore(theLogDiv, moreDiv)
        if (index < fullList.length -1) theLogDiv.setAttribute('vCollapsible', false)
      })
      //outer.insertBefore(inner, moreDiv)
    }
    setTimeout(async () => {
      console.log('NoLogItemList', { NoLogItemList })
      NoLogItemList.forEach(async (noLogItem) => {
        let purl = noLogItem.purl
        if (!purl && noLogItem.tabIdPurlStr) {
          let newPurl = noLogItem.tabIdPurlStr.split('_')
          newPurl.shift()
          purl = newPurl.join('_')
        }
        const newLogItem = await vState.environmentSpecificGetHistoryItem(purl)
        vState.history.filteredItems.push(newLogItem)
        // onsole.log('NoLogItemList p2 ', { purl, newLogItem, noLogItem})
        
        const el = dg.el('vitem_temp_' + noLogItem.tempId)
        if (el && newLogItem.log) {
          const parent = el.parentElement
          parent.innerHTML = ''
          const newItem = lister.drawlogItem(newLogItem.log, { tabtype: 'history' })
          parent.appendChild(newItem.firstChild)
          parent.style.padding = '10px' //  ot sure whay this needed to be re-added?
        } else {
          console.warn('no new log item for ', { purl, newLogItem, el })
        }
      })
    }, 10)

    setTimeout(() => { moreDiv.style.dispaly = 'block' }, 100)

  } else if (list === 'tabs') {
    outer.className = (vState.viewType === 'fullHeight') ? 'heightColumsGridOuter' : 'widthFlexGridOuter'

    // inmitiate page refresh listener if it hasnt been initiated already
    if (!vState.tabs) { 
      window.addEventListener('focus', function() {
        // onsole.log('Window focus gained focus!') // https://www.codeease.net/programming/javascript/javascript-detect-if-the-browser-tab-is-active
        const list = vState.queryParams.list
        if (list === 'tabs') {
          lister.drawAllItemsForList()
        }
      })
      // window.addEventListener('blur', function() { });
    }
    const openWindows = {}
    const closedWindows = {}
    const incognitoWindowIds = []
    let closedWindowCount = 0
    items.currentTabs.forEach(tab => {
      if (!openWindows[tab.windowId]) openWindows[tab.windowId] = {}
      openWindows[tab.windowId][tab.id] = { open: true, tabDetails: tab, tabHistory: []}
      if (tab.incognito) incognitoWindowIds.push(tab.windowId) // openWindows[tab.windowId].incognito = true
    })
    for (let tabid in items.logDetailsInRAM) {
      const tabHistory = items.logDetailsInRAM[tabid] 
      if (!openWindows[tabHistory[0].tabWindowId]) {
        if (!closedWindows[tabHistory[0].tabWindowId]) closedWindowCount++
        if (!closedWindows[tabHistory[0].tabWindowId]) closedWindows[tabHistory[0].tabWindowId] = {}
        closedWindows[tabHistory[0].tabWindowId][tabid] = { open: false, tabDetails: null, tabHistory }
      } else {
        if (!openWindows[tabHistory[0].tabWindowId][tabid]) openWindows[tabHistory[0].tabWindowId][tabid] = { open: false, tabDetails: null }
        openWindows[tabHistory[0].tabWindowId][tabid].tabHistory = tabHistory 
      }
    }
    vState.tabs = [openWindows, closedWindows ]
    console.log('tabs', { openWindows, closedWindows })

    // iterate open and closed tab
    const windowTypes = [openWindows, closedWindows] //  ['openTabs', 'closedTabs'] // 
    let typeCounter = 0
    let windowCounter = 0
    let itemCounter = 1
    mainDiv.firstChild.style.display = 'none'
    windowTypes.forEach(windowType => {
      typeCounter++
      const titleDiv = dg.h2({
        style: { cursor: (typeCounter > 1 ? 'pointer' : ''), color : (typeCounter > 1 ? 'cornflowerblue' : 'white'), margin: '20px 0px 0px 10px' },
        onclick: typeCounter === 1 ? null : function (e) {
          e.target.style.display = 'none'
          let current = e.target
          while (current.nextSibling) {
            current.nextSibling.style.display = 'block'
            current = current.nextSibling
          }
          // e.target.nextSibling.style.display = 'block'
        }
      }, (typeCounter === 1 || isEmpty(windowType)) ? '' : ('Show ' + closedWindowCount + ' Closed Windows'))
      if (typeCounter !== 1) titleDiv.setAttribute('closedWindowTitle', true)
      mainDiv.appendChild(titleDiv)
      for (let [windowId, tabObjects] of Object.entries(windowType)) {
        const isIncognito = incognitoWindowIds.indexOf(parseInt(windowId)) > -1
        const windowOuter = dg.div({ style: { padding: '0px', 'border-radius': '20px', background: 'rgb(10 150 100)', margin: '10px', border: '1px solid white' } })
        if (typeCounter > 1) windowOuter.style.display = 'none'
        const windowTitle = dg.h3({ style: { padding: '0px 0px 0px 20px', color: (isIncognito ? 'black' : 'white')  } }, (typeCounter === 1 ? '' : 'Closed ') + (isIncognito ? ' Incognito ' : '') + 'Window ' + ++windowCounter)
        windowOuter.append(windowTitle)
        const openTabsOuter = lister.emptyFlexBox()
        const drawtabHistory = function (tabObject, tabIsOpen, windowIsOpen) {
          const tabDiv = lister.emptyFlexBox()
          if (tabObject.tabHistory.length === 0) {
            const domainApp = tabObject.tabDetails.url.indexOf('http') === 0 ? domainAppFromUrl(tabObject.tabDetails.url) : tabObject.tabDetails.url.split(':')[0] // for 'file' or 'chrome'
            tabObject.tabHistory = [{
              purl: tabObject.tabDetails.url,
              domainApp,
              vSearchString: resetVulogKeyWords({ url: tabObject.tabDetails.url }),
              _date_modified: tabObject.tabDetails.lastAccessed,
              tabid: tabObject.tabDetails.id,
              title: tabObject.tabDetails.title || domainApp,
              vulog_favIconUrl: tabObject.tabDetails.favIconUrl,
              tabWindowId: tabObject.tabDetails.windowId
            }]
          }
          const drawnTabUrls = [ tabObject.tabHistory[0].purl ]
          tabObject.tabHistory.reverse().forEach((logItem, i) => {
            if (drawnTabUrls.indexOf(logItem.purl) < 0 || i === tabObject.tabHistory.length - 1) { 
              drawnTabUrls.push(logItem.purl)
              logItem.fj_local_temp_unique_id = itemCounter++
              const isCurrentOpenCard = ((i === tabObject.tabHistory.length - 1) && tabIsOpen)
              const theLogDiv = lister.drawTabItem(logItem, { tabDetails: tabObject.tabDetails, tabIsOpen, isCurrentOpenCard, windowIsOpen }) 
              theLogDiv.firstChild.style.background = (isCurrentOpenCard ? 'white' : 'lightgrey')
              if (i < tabObject.tabHistory.length - 1) {
                theLogDiv.setAttribute('vCollapsible', true)
                //theLogDiv.firstChild.style.transform = 'rotateY(90deg)'      
              }
              tabDiv.appendChild(theLogDiv)
            } else { /* tab is already drawn */}
          })
          const outer = dg.div({ className: 'tabOuter', style: { padding: '10px' /*, border: '1px solid red' */ }})

          if (tabIsOpen) {
            outer.appendChild(dg.div(
              { style: { 'text-align': 'right', 'margin-right': '40px', 'min-height': '16px'}},
                dg.div({ className: 'muteCloseHolder'},   
                  dg.span({
                    className:'muteButton', 
                    style: { display: (tabObject.tabDetails?.audible && !tabObject.tabDetails?.mutedInfo?.muted ? '': 'none'), background: 'white', 'margin-right': '5px', 'border-radius': '5px', padding: '5px', cursor: 'pointer', color: 'mediumpurple' },
                    onclick: (e) => {
                      chrome.tabs.update(tabObject.tabDetails?.id, { muted: true }, function() { })
                      const muteButton = getParentWithClass(e.target, 'muteButton')
                      muteButton.style.display = 'none'
                    }
                  },
                  dg.span('Mute'),
                  dg.span({ className: 'fa fa-volume-off', style: { width: '15px', 'font-size': '15px' } }),
                  dg.span({ className: 'fa fa-times', style: { width: '10px', 'font-size': '10px', 'vertical-align': 'top', 'margin-top': '3px'} })
                  ),
                  dg.span({
                  style: { background: 'white', 'border-radius': '5px', padding: '5px', cursor: 'pointer', color: 'indianred' },
                  onclick: (e) => {
                    chrome.tabs.remove(tabObject.tabDetails?.id, function() {
                      const theDiv = getParentWithClass(e.target, 'tabOuter')
                      Array.from(theDiv.firstChild.nextSibling.childNodes).forEach(child => {
                        child.style.transform = 'rotateX(90deg)'
                      })
                      setTimeout(() => {theDiv.remove() }, 400); 
                      windowType[tabObject.tabDetails?.windowId][tabObject.tabDetails?.id].open = false
                      
                      const closedTabsOuter = document.querySelector('[closedTabListForWindow="' + tabObject.tabDetails?.windowId + '"]')
                      closedTabsOuter.appendChild(drawtabHistory(tabObject, false, (typeCounter === 1))) 
                      // nb if this is the last window should remove the window and add it to closed windows secion, ut igneod that for the moment
                      })
                    // chrome.tabs.remove(tab.id, function() { })
                    // theDiv.style.display = 'none'
                    // remove from db
                  }
                }, 
                dg.span('Close'),
                dg.span({ className: 'fa fa-times', style: { width: '20px'} })
            ))))
            outer.appendChild(dg.div({ style: { 'min-width': '2px'}}))
          }
          outer.append(tabDiv)
          return outer
        }
        const closedTabList = []
        const openTabsList = []
        for (let [tabId, tabObject] of Object.entries(tabObjects)) {
          if (!tabObject.open) {
            tabObject.tabDetails = { windowId: parseInt(windowId) }
            closedTabList.push(tabObject)
          } else {
            openTabsList.push(tabObject)
          }
        }
        openTabsList.sort((a, b) => { return a.tabDetails.index < b.tabDetails.index ? -1 : 1 })
        openTabsList.forEach(tabObject => 
          openTabsOuter.appendChild(drawtabHistory(tabObject, true, true))
        )
        windowOuter.appendChild(openTabsOuter)

        const closedTabsOuter = lister.emptyFlexBox()
        if (closedTabList && closedTabList.length > 0) {
          const titleDiv = dg.div({
            style: { 'padding': '20px', 'font-size': '12px', color: 'blue  ', cursor: 'pointer', display: (typeCounter === 1 ? 'block' : 'none') },
            onclick: function (e) {
              e.target.style.display = 'none'
              e.target.nextSibling.style.display = 'flex'
              // expandSection(e.target.nextSibling)
            }
          }, 'See ' + closedTabList.length + ' Closed Tabs')
          if (typeCounter === 1) titleDiv.setAttribute('closedTabTitle', true)
          windowOuter.appendChild(titleDiv) 

          closedTabsOuter.setAttribute('closedTabListForWindow', windowId)
          closedTabsOuter.style['border-top'] = '1px solid white'
          closedTabsOuter.style.display = (typeCounter > 1 ? 'flex' : 'none')
          // closedTabsOuter.style.height = '0'
          closedTabList.forEach(tabObject => 
            closedTabsOuter.appendChild(drawtabHistory(tabObject, false, (typeCounter === 1)))
          )
        }
        windowOuter.appendChild(closedTabsOuter)

   // use openerTabId as a way of finding referrer!
   // 
        mainDiv.appendChild(windowOuter)
      }
    })
  }
}
const tabRecordByPurl = function (purl) {
  let logToreturn = null
  vState.tabs.forEach(windowType => {
    for (let [windowId, tabObjects] of Object.entries(windowType)) {
      for (let [tabId, tabObject] of Object.entries(tabObjects)) {
        tabObject.tabHistory.forEach((logItem, i) => {
          if (logItem.purl === purl) logToreturn = logItem
          if (logItem.purl === purl) return logItem
        })
      }
    }
  })
  return logToreturn
}
const drawBoxAroundTabCards = function (cardDiv) {
  cardDiv.parentElement.parentElement.parentElement.style.border = '2px solid white'
  cardDiv.parentElement.parentElement.parentElement.style.background = 'rgb(10, 120, 70)' // 'rgb(121, 172, 18)'
  cardDiv.parentElement.parentElement.parentElement.style['border-radius'] = '15px'
}

// draw cards: marks logs messages etc
lister.dims = {
  marks: {
    width: 200,
    height: 300
  },
  history: {
    width: 200,
    widthForCollpasing: 220,
    height: 200
  },
  tabs: {
    width: 200,
    widthForCollpasing: 200,
    height: 190
  },
  messages: {
    width: 200,
    height: 360
  },
  publicmarks: {
    width: '100%',
    height: null
  }
}
lister.drawmarkItem = function (markOnMark, opt = {}) {
  const { tabtype, expandedView, fromAutoUpdate } = opt
  const itemdiv = fromAutoUpdate
    ? dg.div()
    : lister.cardOuter(markOnMark, 'marks', expandedView)

  if (expandedView) itemdiv.setAttribute('expandedView', (expandedView))
  if (tabtype) itemdiv.setAttribute('tabtype', tabtype)
  itemdiv.setAttribute('purl', markOnMark.purl)
  itemdiv.className = 'cardOuter'

  const minMax = lister.minMaximizeButt(lister.idFromMark(markOnMark))
  lister.minMaximizeButtSet(minMax, true)
  itemdiv.appendChild(minMax)

  itemdiv.appendChild(lister.domainSpanWIthRef(markOnMark, expandedView))

  const titleOuter = lister.titleOuter(expandedView)
  if (!markOnMark.url) console.warn('No url is markOnMark', { markOnMark })
  titleOuter.appendChild(lister.openOutside(markOnMark.url))

  const titleInner = dg.a({ style: { overflow: 'hidden', 'text-decoration': 'none' } }, (markOnMark.title || markOnMark.purl.replace(/\//g, ' ')))
  titleInner.setAttribute('href', markOnMark.url)
  titleOuter.appendChild(titleInner)

  itemdiv.appendChild(titleOuter)

  const stars = overlayUtils.drawstars(markOnMark, {
    drawTrash: true,
    trashFloatHide: true,
    markOnBackEnd: vState.markOnBackEnd
  })
  itemdiv.appendChild(dg.div({ className: 'starsOnCard', style: { 'text-align': 'center' } }, stars))

  itemdiv.appendChild(lister.imageBox(markOnMark.image, null, titleInner))

  const summaryOuter = dg.div({ className: 'summarySharingAndHighlights' })
  summaryOuter.appendChild(lister.summarySharingAndHighlights(markOnMark))
  itemdiv.appendChild(summaryOuter)

  const notesBox = overlayUtils.drawMainNotesBox(markOnMark, { mainNoteSaver: vState.mainNoteSaver })
  notesBox.style.margin = '0px 0px 5px 0px'
  notesBox.style['max-height'] = '40px'
  notesBox.style.height = '40px'
  notesBox.style['overflow-y'] = 'scroll'
  itemdiv.appendChild(notesBox)

  const modifiedDate = new Date(markOnMark._date_modified || markOnMark.fj_modified_locally)
  const createdDate = new Date(markOnMark.vCreated || markOnMark._date_created)
  let dateString = 'Created: ' + (overlayUtils.smartDate(createdDate))
  if (modifiedDate - createdDate > 1000 * 60 * 60 * 24) dateString += ' Modified: ' + (modifiedDate.toLocaleDateString())
  itemdiv.appendChild(dg.div({ style: { color: 'indianred' } }, dateString))

  const hLightOptions = {
    type: 'markHighlights',
    purl: markOnMark.purl,
    markOnBackEnd: vState.markOnBackEnd,
    markOnMarks: markOnMark,
    logToConvert: null,
    hLightCommentSaver: vState.hLightCommentSaver,
    hLightDeleter: vState.hLightDeleter
  }
  if (!hLightOptions.hLightCommentSaver) console.error('No hLightOptions hLightCommentSaver  in drawmakr', { fromV: vState.hLightCommentSaver })
  itemdiv.appendChild(lister.newDrawHighlights(markOnMark.purl, markOnMark.vHighlights, hLightOptions)) //
  // previous;y allHighlights
  itemdiv.appendChild(overlayUtils.areaTitle('Sharing', { display: 'none' }))
  itemdiv.appendChild(lister.sharingDetailsSkeleton(markOnMark.purl))
  itemdiv.appendChild(overlayUtils.vMessageCommentDetails(markOnMark.purl, []))
  const msgHighLightoptions = JSON.parse(JSON.stringify(hLightOptions))
  msgHighLightoptions.hLightCommentSaver = vState.hLightCommentSaver
  msgHighLightoptions.type = 'msgHighLights'
  if (!msgHighLightoptions.hLightCommentSaver) console.error('No hLightOptions hLightCommentSaver msgHighLightoptions in drawmakr')
  itemdiv.appendChild(lister.newDrawHighlights(markOnMark.purl, [], msgHighLightoptions)) //

  return lister.addCard2ndOuter(itemdiv, 'marks')
}
lister.summarySharingAndHighlights = function (markOnMark) {
  const hasHighlights = (markOnMark.vHighlights && markOnMark.vHighlights.length > 0)
  const summarySharingAndHighlights = dg.div({
    style: { display: 'grid', 'grid-template-columns': (hasHighlights ? '1fr 1fr' : '1fr'), cursor: 'pointer', padding: '2px' }
  })
  if (markOnMark.vHighlights && markOnMark.vHighlights.length > 0) {
    const highlightSum = dg.div({ style: { overflow: 'hidden', color: '#057d47', 'padding-top': '3px' } },
      dg.div((markOnMark.vHighlights.length + ' highlights'),
        dg.div({ style: { overflow: 'hidden', 'text-overflow': 'ellipsis', height: '18px', 'margin-bottom': '-5px' } }, 'Click to see')))
    highlightSum.onclick = async function () { await lister.setItemExpandedStatus(lister.idFromMark(markOnMark)) }
    summarySharingAndHighlights.appendChild(highlightSum)
  } else {
    summarySharingAndHighlights.appendChild(dg.div(dg.div()))
  }

  const sharingSpan = vState.isLoggedIn ? lister.allPeopleSharedWith(markOnMark) : dg.span('Expand for details')
  const sharingButt = dg.div(
    { style: { 'text-align': 'center', color: 'purple', height: '32px', overflow: 'hidden', padding: '2px 5px 2px 5px' } }, sharingSpan)
  sharingButt.onclick = async function () { await lister.setItemExpandedStatus(lister.idFromMark(markOnMark)) }
    // : function () { window.open('logInPage', '_self') }
  summarySharingAndHighlights.appendChild(sharingButt)
  return summarySharingAndHighlights
}
lister.drawpublicmarkItem = function (markOnMark, opt = {}) {
  const { fromAutoUpdate } = opt
  const itemdiv = fromAutoUpdate
    ? dg.div()
    : lister.cardOuter(markOnMark, 'publicmarks', false)

  itemdiv.setAttribute('purl', markOnMark.purl)
  itemdiv.className = 'cardOuter'

  // itemdiv.style['max-height'] = '300px'
  if (vState.viewType === 'fullHeight') {
    itemdiv.style.display = 'inline-block'
    itemdiv.style.width = '100%'
    itemdiv.style['margin-bottom'] = '10px'
    itemdiv.style['box-sizing'] = 'border-box'
  }

  // itemdiv.style.overflow = 'scroll'

  const hasComments = (markOnMark.vComments && markOnMark.vComments.length > 0)
  if (hasComments) {
    markOnMark.vComments.forEach(vComment => {
      if (!vComment.sender_id) vComment.sender_id = markOnMark._data_owner
      itemdiv.appendChild(overlayUtils.oneComment(markOnMark.purl, vComment, {
        isReceived: true, noreply: true, addPerson: true, nofrom: true
      }))
    })
  }

  const domainOuter = dg.div()
  domainOuter.appendChild(lister.domainSpanWIthRef(markOnMark, true))
  domainOuter.firstChild.appendChild(lister.openOutside(markOnMark.url, { nomargin: true }))
  itemdiv.appendChild(domainOuter)

  const titleOuter = lister.titleOuter(true)
  const titleInner = dg.a({ style: { overflow: 'hidden', 'text-decoration': 'none' } }, (markOnMark.title || markOnMark.purl.replace(/\//g, ' ')))
  titleInner.setAttribute('href', markOnMark.url)
  titleOuter.appendChild(titleInner)
  itemdiv.appendChild(titleOuter)

  const hasImg = Boolean(markOnMark.image)
  const hasDescript = Boolean(markOnMark.description)
  const hasHighlights = (markOnMark.vHighlights && markOnMark.vHighlights.length > 0)

  const titleGrid = dg.div({
    className: 'topTitleGrid',
    style: { display: 'grid', 'grid-template-columns': ((hasImg ? '1fr' : '') + (hasDescript ? ' 1fr' : '')), padding: '2px' }
  })
  if (hasDescript) {
    titleGrid.appendChild(dg.div({ style: { 'max-height': (hasHighlights ? '100px' : null), overflow: 'hidden', 'text-overflow': 'ellipsis', color: 'darkgrey' } }, markOnMark.description))
  }
  if (hasImg) {
    const imgBox = lister.imageBox(markOnMark.image, { 'border-radius': '20px', 'margin-top': '0px', 'max-height': '95px', 'max-width': '100%' }, titleInner)
    imgBox.style['max-height'] = '100px'
    imgBox.style.height = '100px'
    imgBox.style.padding = '0px 5px'
    titleGrid.appendChild(imgBox)
  }
  itemdiv.appendChild(titleGrid)

  if (hasHighlights) {
    const titleOuter = dg.div()
    const title = overlayUtils.areaTitle('Highlights', { display: 'inline-block' })
    title.style.width = '100%'
    titleOuter.appendChild(title)

    //  display: 'block', 'text-align': 'right', padding: '5px 0px', width: '100%',
    const openWithVulog = dg.a({ style: { float: 'right', 'font-size': 'small', 'font-weight': 'normal' } }, 'Open with hiper.cards')
    const href = (vState.isExtension ? (vState.freezrMeta?.serverAddress || 'https://freezr.info') : '') +  '/' + markOnMark._id + '?vulogredirect=true'
    openWithVulog.setAttribute('href', href)
    openWithVulog.setAttribute('target', '_blank')
    titleOuter.firstChild.appendChild(openWithVulog)

    itemdiv.appendChild(titleOuter)

    markOnMark.vHighlights.forEach(hlight => {
      if (hlight.vComments && hlight.vComments.length > 0) {
        hlight.vComments.forEach(comment => {
          if (!comment.sender_id) comment.sender_id = markOnMark._data_owner
        })
      }
      itemdiv.appendChild(overlayUtils.drawHighlight(markOnMark.purl, hlight, { noThreeDots: true, isReceived: true, noreply: true, addPerson: true, nofrom: true }))
    })
  } else {
    titleGrid.appendChild(dg.div({ style: { 'min-height': '20px' } }))
  }

  const postedDate = new Date(markOnMark._date_published || markOnMark._date_modified)
  const dateString = 'Posted: ' + (overlayUtils.smartDate(postedDate))
  itemdiv.appendChild(dg.div({ style: { color: 'indianred', float: 'right' } }, dateString))

  itemdiv.appendChild(overlayUtils.vMessageCommentDetails(markOnMark.purl, []))

  return lister.addCard2ndOuter(itemdiv, 'publicmarks')
}
lister.drawlogItem = function (logItem, opt = {}) {
  if (!logItem || !logItem.purl) return dg.div({style: { 'background-color': 'red', color: 'white' }}, 'err - No log item')
  const { tabtype, expandedView, fromAutoUpdate } = opt
  const itemdiv = fromAutoUpdate
    ? dg.div()
    : lister.cardOuter(logItem, 'history', expandedView)

  itemdiv.setAttribute('vulogId', lister.idFromMark(logItem))
  itemdiv.setAttribute('purl', logItem.purl)
  if (expandedView) itemdiv.setAttribute('expandedView', (expandedView))
  if (tabtype) itemdiv.setAttribute('tabtype', tabtype)
  itemdiv.className = 'cardOuter'

  const minMax = lister.minMaximizeButt(lister.idFromMark(logItem))
  lister.minMaximizeButtSet(minMax, true)
  itemdiv.appendChild(minMax)

  itemdiv.appendChild(lister.domainSpanWIthRef(logItem, expandedView))

  let urlText = (logItem.title || (logItem.purl.replace(/\//g, ' ')))
  if (urlText.indexOf('chrome-extension') === 0 || urlText.indexOf('http') === 0) {
    const oldUrl = urlText
    urlText = ''
    for (let i = 0; i < oldUrl.length; i++) {
      urlText += (oldUrl.charAt(i) + '&#8203')
    }
  }
  if (!logItem.url) console.warn('No url is logItem', { logItem })
  const titleOuter = lister.titleOuter(expandedView)
  const titleInner = dg.a({ style: { overflow: 'hidden', 'text-decoration': 'none' } })
  titleInner.innerHTML = urlText
  titleInner.setAttribute('href', logItem.url)

  titleOuter.appendChild(lister.openOutside(logItem.url))
  titleOuter.appendChild(titleInner)

  itemdiv.appendChild(titleOuter)

  itemdiv.appendChild(dg.div({
    className: 'scrollAndTimeSpent',
    style: {
      height: '14px',
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
      'white-space': 'nowrap',
      color: MCSS.DARK_GREY
      // 'margin-bottom': '5px'
    }
  }, timeAndScrollString(logItem)))

  // image
  const imageBox = lister.imageBox(logItem.image, null, titleInner)
  imageBox.firstChild.style.padding = '0px 5px 5px 5px'
  imageBox.onclick = async function () { await lister.setItemExpandedStatus(lister.idFromMark(logItem)) }
  itemdiv.appendChild(imageBox)

  itemdiv.appendChild(dg.div({
    className: 'greyMessage',
    style: {
      'margin-left': '40px',
      'margin-top': '50px',
      cursor: 'pointer',
      color: '#747474',
      display: 'none'
    }
  }, 'Click to view details'))

  const markFromLog = (logItem?.purl && vState.logs?.lookups) ? vState.logs?.lookups[logItem.purl] : null // note this doesnt necessarily capture all marks, only recent ones...
  const stars = overlayUtils.drawstars(markFromLog || logItem, {
    drawTrash: false,
    showBookmark: true,
    markOnBackEnd: vState.markOnBackEnd,
    logToConvert: logItem
  })
  itemdiv.appendChild(dg.div({ className: 'starsOnCard', style: { 'text-align': 'center', display: (expandedView ? 'block' : 'none') } }, stars))
  const smallStars = overlayUtils.drawSmallStars(markFromLog)
  smallStars.onclick = async function () { await lister.setItemExpandedStatus(lister.idFromMark(logItem)) }
  // smallStars.appendChild(dg.div({ style: { display: 'inline-block', cursor: 'pointer', 'vertical-align': 'top', margin: '8px 0px 0px 8px', color: 'lightgrey' } }, 'Share'))
  itemdiv.appendChild(dg.div({ className: 'smallStarsOnCard', style: { 'text-align': 'center', height: '15px', display: (expandedView ? 'none' : 'block') } }, smallStars))

  const notesBox = overlayUtils.drawMainNotesBox(markFromLog, { mainNoteSaver: vState.mainNoteSaver, log: logItem })
  itemdiv.appendChild(dg.div({ className: 'vNote', style: { display: (expandedView ? 'block' : 'none') } }, notesBox))

  itemdiv.appendChild(
    dg.div({
      style: {
        display: 'none',
        height: '17px',
        'text-overflow': 'ellipsis',
        'white-space': 'nowrap',
        'vertical-align': 'bottom',
        color: MCSS.DARK_GREY
      },
      className: 'viaReferrer'
    },
    (logItem?.referrer?.trim() ? (dg.span(' via ', dg.a({ href: logItem.referrer, style: { color: 'grey' } }, logItem.referrer))) : ' ')
    ))

  const dateToUse = new Date(logItem.vCreated) // logItem._date_modified

  const weekday = ['Sun', 'Mon', 'Tues', 'Wed', 'Thurs', 'Fri', 'Sat']
  const dateString = weekday[dateToUse.getDay()] + ' ' + (dateToUse.toLocaleDateString() + ' ' + dateToUse.toLocaleTimeString()) // + ' ' + dateToUse
  itemdiv.appendChild(dg.div({ className: 'dateString', style: { color: 'indianred', 'margin-top': '10px' } }, dateString))

  const hLightOptions = {
    type: 'markHighlights',
    purl: logItem.purl,
    markOnBackEnd: vState.markOnBackEnd,
    markOnMarks: markFromLog,
    logToConvert: logItem,
    hLightCommentSaver: vState.hLightCommentSaver,
    hLightDeleter: vState.hLightDeleter
  }
  itemdiv.appendChild(lister.newDrawHighlights(logItem.purl, markFromLog?.vHighlights, hLightOptions)) //
  itemdiv.appendChild(overlayUtils.areaTitle('Sharing', { display: 'none' }))
  itemdiv.appendChild(lister.sharingDetailsSkeleton(logItem.purl))
  itemdiv.appendChild(overlayUtils.vMessageCommentDetails(logItem.purl, []))
  const msgHighLightoptions = JSON.parse(JSON.stringify(hLightOptions))
  msgHighLightoptions.type = 'msgHighLights'
  itemdiv.appendChild(lister.newDrawHighlights(logItem.purl, [], msgHighLightoptions)) //

  return lister.addCard2ndOuter(itemdiv, 'history')
}
lister.drawTabItem = function (logItem, opt = {}) {
  const { expandedView, fromAutoUpdate, tabDetails, isCurrentOpenCard, tabIsOpen, windowIsOpen } = opt
  const itemdiv = fromAutoUpdate
    ? dg.div()
    : lister.cardOuter(logItem, 'tabs', expandedView)

  itemdiv.setAttribute('vulogId', lister.idFromMark(logItem))
  itemdiv.setAttribute('purl', logItem.purl)
  if (expandedView) itemdiv.setAttribute('expandedView', (expandedView))
  itemdiv.className = 'cardOuter'

  const showHideCloseMuteAndExpand = async function (e) {
    await lister.setItemExpandedStatus(lister.idFromMark(logItem))
    const cardOuter = getParentWithClass(e.target, 'cardOuter')
    drawBoxAroundTabCards(cardOuter)
    if (tabIsOpen && isCurrentOpenCard) {
      const expandedView = cardOuter.getAttribute('expandedView') === 'true'
      const tabOuter = getParentWithClass(e.target, 'tabOuter')
      tabOuter.firstChild.firstChild.style.display = expandedView ? 'none' : 'block'
    }
  }

  const minMax = lister.minMaximizeButt(lister.idFromMark(logItem))
  lister.minMaximizeButtSet(minMax, true)
  minMax.onclick = showHideCloseMuteAndExpand
  itemdiv.appendChild(minMax)

  itemdiv.appendChild(lister.domainSpanWIthRef(logItem, expandedView))
 
  let urlText = (logItem.title || (logItem.purl.replace(/\//g, ' ')))
  if (urlText.indexOf('chrome-extension') === 0 || urlText.indexOf('http') === 0) {
    const oldUrl = urlText
    urlText = ''
    for (let i = 0; i < oldUrl.length; i++) {
      urlText += (oldUrl.charAt(i) + '&#8203')
    }
  }
  if (!logItem.purl) console.warn('No purl is logItem', { logItem })
  const titleOuter = lister.titleOuter(expandedView)
  const goToOrOpenTab = function () {
    if (tabIsOpen && isCurrentOpenCard) {
      // chrome.tabs.update(logItem.tabid, { active: true })
      // chrome.windows.update(logItem.tabWindowId, { focused: true })
      chrome.windows.update(tabDetails.windowId, {focused: true}, (window) => {
        chrome.tabs.update(tabDetails.id, {active: true})
      })
    } else if (parseInt(itemdiv.parentElement.style.marginRight) < 0){
      // do nothing as card is collapsed
    } else if (!windowIsOpen) {
      window.open(logItem.url, '_blank')
    } else {
      chrome.tabs.create({
        url: logItem.url,
        active: true,
        windowId: tabDetails.windowId
      }, function (newInfo) {
        chrome.windows.update(tabDetails.windowId, {focused: true}, (window) => {
          chrome.tabs.update(newInfo.id, {active: true})
        })
      })
    }
  }
  const titleInner = dg.a({ onclick: goToOrOpenTab, style: { overflow: 'hidden', 'text-decoration': 'none', cursor: 'pointer' } })
  titleInner.innerHTML = urlText
  titleOuter.appendChild(dg.div({
    className: 'fa fa-external-link',
    style: { float: 'right', color: 'cornflowerblue', 'font-size': '18px', margin: '6px 0px 0px 5px', cursor: 'pointer' },
    onclick: goToOrOpenTab
  }))
  titleOuter.appendChild(titleInner)

  itemdiv.appendChild(titleOuter)

  // image
  const imageBox = lister.imageBox(logItem.image, null, titleInner)
  imageBox.firstChild.style.padding = '0px 5px 5px 5px'
  // imageBox.onclick = async function () { await lister.setItemExpandedStatus(lister.idFromMark(logItem)) }
  itemdiv.appendChild(imageBox)

  const markFromLog = (logItem?.purl && vState.logs?.lookups) ? vState.logs?.lookups[logItem.purl] : null // note this doesnt necessarily capture all marks, only recent ones...
  const stars = overlayUtils.drawstars(markFromLog || logItem, {
    drawTrash: false,
    showBookmark: true,
    markOnBackEnd: vState.markOnBackEnd,
    logToConvert: logItem
  })
  itemdiv.appendChild(dg.div({ className: 'starsOnCard', style: { 'text-align': 'center', margin: '5px 100px', 'background-color': 'white', 'border-radius': '10px', 'padding-top': '5px', display: (expandedView ? 'block' : 'none') } }, stars))
  const smallStars = overlayUtils.drawSmallStars(markFromLog)
  smallStars.onclick = showHideCloseMuteAndExpand
  itemdiv.appendChild(dg.div({ className: 'smallStarsOnCard', style: { 'text-align': 'center', background: 'white', 'border-radius': '3px', padding: '2px', margin: '2px 20px', height: '15px', display: (expandedView ? 'none' : 'block') } }, smallStars))

  const notesBox = overlayUtils.drawMainNotesBox(markFromLog, { mainNoteSaver: vState.mainNoteSaver, log: logItem })
  itemdiv.appendChild(dg.div({ className: 'vNote', style: { display: (expandedView ? 'block' : 'none') } }, notesBox))

  itemdiv.appendChild(
    dg.div({
      style: {
        display: 'none',
        height: '17px',
        'text-overflow': 'ellipsis',
        'white-space': 'nowrap',
        'vertical-align': 'bottom',
        color: MCSS.DARK_GREY
      },
      className: 'viaReferrer'
    },
    (logItem?.referrer?.trim() ? (dg.span(' via ', dg.a({ href: logItem.referrer, style: { color: 'grey' } }, logItem.referrer))) : ' ')
    ))

  if (logItem.vCreated || logItem.fj_modified_locally) {
    const dateToUse = new Date(logItem.vCreated || logItem.fj_modified_locally)
    const weekday = ['Sun', 'Mon', 'Tues', 'Wed', 'Thurs', 'Fri', 'Sat']
    const dateString = weekday[dateToUse.getDay()] + ' ' + (dateToUse.toLocaleDateString() + ' ' + dateToUse.toLocaleTimeString()) // + ' ' + dateToUse
    itemdiv.appendChild(dg.div({ className: 'dateString', style: { color: 'indianred', 'margin-top': '5px' } }, dateString))
  }

  const hLightOptions = {
    type: 'markHighlights',
    purl: logItem.purl,
    markOnBackEnd: vState.markOnBackEnd,
    markOnMarks: markFromLog,
    logToConvert: logItem,
    hLightCommentSaver: vState.hLightCommentSaver,
    hLightDeleter: vState.hLightDeleter
  }
  itemdiv.appendChild(lister.newDrawHighlights(logItem.purl, markFromLog?.vHighlights, hLightOptions)) //
  itemdiv.appendChild(overlayUtils.areaTitle('Sharing', { display: 'none' }))
  itemdiv.appendChild(lister.sharingDetailsSkeleton(logItem.purl))
  itemdiv.appendChild(overlayUtils.vMessageCommentDetails(logItem.purl, []))
  const msgHighLightoptions = JSON.parse(JSON.stringify(hLightOptions))
  msgHighLightoptions.type = 'msgHighLights'
  itemdiv.appendChild(lister.newDrawHighlights(logItem.purl, [], msgHighLightoptions)) //

  return lister.addCard2ndOuter(itemdiv, 'tabs')
}
lister.drawMessageItem = function (msgRecord, opt = {}) {
  const { expandedView, fromAutoUpdate } = opt
  const itemdiv = fromAutoUpdate
    ? dg.div()
    : lister.cardOuter(msgRecord, 'messages', expandedView)

  if (!msgRecord || !msgRecord.purl) {
    console.error('missing purl in record ', { msgRecord })
    itemdiv.style.display = 'none'
    return lister.addCard2ndOuter(itemdiv, 'messages')
  }
  if (!msgRecord.url) console.warn('No url in msgRecord', { msgRecord })

  if (expandedView) itemdiv.setAttribute('expandedView', (expandedView))
  itemdiv.setAttribute('tabtype', 'messages')
  itemdiv.setAttribute('purl', msgRecord.purl)
  itemdiv.className = 'cardOuter'

  const minMax = lister.minMaximizeButt(lister.idFromMark(msgRecord))
  lister.minMaximizeButtSet(minMax, true)
  itemdiv.appendChild(minMax)

  itemdiv.appendChild(lister.domainSpanWIthRef(msgRecord, expandedView))

  const titleOuter = lister.titleOuter(expandedView)
  titleOuter.appendChild(lister.openOutside(msgRecord.url))

  const titleInner = dg.a({ style: { overflow: 'hidden', 'text-decoration': 'none' } }, (msgRecord.title || msgRecord.purl.replace(/\//g, ' ')))
  titleInner.setAttribute('href', msgRecord.url)
  titleOuter.appendChild(titleInner)

  itemdiv.appendChild(titleOuter)

  itemdiv.appendChild(lister.imageBox(msgRecord.image, null, titleInner))

  const markOnMarks = vState.marks.lookups[msgRecord.purl]

  const stars = overlayUtils.drawstars(markOnMarks || convertLogToMark(msgRecord), {
    drawTrash: false,
    showBookmark: true,
    markOnBackEnd: vState.markOnBackEnd,
    logToConvert: msgRecord
  })
  itemdiv.appendChild(dg.div({ className: 'starsOnCard', style: { 'text-align': 'center', display: (expandedView ? 'block' : 'none') } }, stars))

  const smallStars = overlayUtils.drawSmallStars(markOnMarks)
  smallStars.onclick = async function () { await lister.setItemExpandedStatus(lister.idFromMark(msgRecord)) }
  itemdiv.appendChild(dg.div({ className: 'smallStarsOnCard', style: { 'text-align': 'center', height: '15px', display: (expandedView ? 'none' : 'block') } }, smallStars))

  const notesBox = overlayUtils.drawMainNotesBox(markOnMarks, { mainNoteSaver: vState.mainNoteSaver, log: msgRecord })
  itemdiv.appendChild(dg.div({ className: 'vNote', style: { display: (expandedView ? 'block' : 'none'), padding: '10px 40px' } }, notesBox))

  itemdiv.appendChild(overlayUtils.areaTitle('Sharing', { display: 'none' }))
  itemdiv.appendChild(lister.sharingDetailsSkeleton(msgRecord.purl))

  itemdiv.appendChild(overlayUtils.vMessageCommentSummary(msgRecord.purl, msgRecord.vComments))
  itemdiv.appendChild(overlayUtils.vMessageCommentDetails(msgRecord.purl, msgRecord.vComments))

  if ((markOnMarks && markOnMarks.vHighlights && markOnMarks.vHighlights.length > 0) || (msgRecord.vHighlights && msgRecord.vHighlights.length > 0)) {
    // itemdiv.appendChild(dg.h2('new hlights'))
    const hLights = markMsgHlightsAsMarked(markOnMarks?.vHighlights, msgRecord?.vHighlights)
    const logToConvert = JSON.parse(JSON.stringify(msgRecord))
    logToConvert.vHighlights = []
    logToConvert.vComments = []
    logToConvert._id = null
    const options = {
      type: 'msgHighLights',
      purl: msgRecord.purl,
      markOnBackEnd: vState.markOnBackEnd,
      markOnMarks,
      logToConvert,
      hLightCommentSaver: vState.hLightCommentSaver,
      hLightDeleter: vState.hLightDeleter
    }
    itemdiv.appendChild(lister.newDrawHighlights(msgRecord.purl, hLights, options)) //
  }

  return lister.addCard2ndOuter(itemdiv, 'messages')
}

// Expanding card
lister.setItemExpandedStatus = async function (id) {
  if (vState.viewType === 'fullHeight') console.error('setexpanded view cannot be used with fullheight')
  const theDiv = dg.el(id)
  const expandedView = theDiv.getAttribute('expandedView') === 'true'
  const purl = theDiv.getAttribute('purl')

  const list = vState.queryParams.list
  let gotFetchErr = false

  const doExpand = !expandedView
  theDiv.setAttribute('expandedView', doExpand || null)
  theDiv.style.overflow = doExpand ? 'scroll' : 'hidden'

  if (doExpand) {
    theDiv.style.position = 'absolute'
    theDiv.style['z-index'] = vState.zIndex++
  }
  const titleOuter = theDiv.querySelector('.vulog_title_url')
  titleOuter.style.height = doExpand ? null : '33px'
  const smallStarsOnCard = theDiv.querySelector('.smallStarsOnCard') 
  if (smallStarsOnCard) smallStarsOnCard.style.display = doExpand ? 'block' : 'none'


  const divLeft = theDiv.getClientRects()[0].left
  const screenWidth = document.body.getClientRects()[0].width
  let moveX = theDiv.getAttribute('data-moveX') || (divLeft < 200 ? 50 : (screenWidth - divLeft < 400 ? -200 : 0))
  if (!moveX || isNaN(moveX)) moveX = 0
  const moveY = theDiv.getAttribute('data-moveY') || -50
  theDiv.setAttribute('data-moveY', moveY)
  theDiv.setAttribute('data-moveX', moveX)
  theDiv.style.transform = doExpand ? ('translate( ' + moveX + 'px , -50px)') : null

  theDiv.style.height = doExpand ? '600px' : (lister.dims[list].height + 'px')
  theDiv.style.width = doExpand ? '400px' : (lister.dims[list].width + 'px')
  if (doExpand && theDiv.parentElement.previousSibling && theDiv.parentElement.previousSibling.getAttribute('vCollapsible')) {
    // if previous el is collapsed, make it uncollpased
    lister.setCardAsCollapsible(theDiv.parentElement.previousSibling.firstChild, false, { list })
  }
  if (!doExpand) {
    setTimeout(() => {
      theDiv.style.position = null
      theDiv.style['z-index'] = null
    }, 1000)
  }
  // theDiv.o
  const trash = theDiv.querySelector('.vulog_overlay_trash')

  if (doExpand) {
    if (trash) trash.style.display = 'block'
    if (trash) trash.parentElement.style['padding-right'] = '40px'
    const color = list === 'tabs' && theDiv.parentElement.getAttribute('vCollapsible') === 'true' ? 'lightgrey' : 'white' 
    theDiv.firstChild.nextSibling.style.background = 'linear-gradient(to bottom, #aae9cc, ' + color + ' 20%, #aae9cc 20%, ' + color + ' 30%, #aae9cc 40%, ' + color + ' 50%, #aae9cc 60%, ' + color + ' 70%, #aae9cc 80%, ' + color + ' 90%)'
    theDiv.firstChild.nextSibling.style.cursor = 'grab'
    theDiv.firstChild.nextSibling.id = theDiv.id + 'header'
    lister.dragElement(theDiv)
  } else {
    if (trash) trash.style.display = 'none'
    if (trash) trash.parentElement.style['padding-right'] = null
    theDiv.firstChild.nextSibling.style.background = null
    theDiv.firstChild.nextSibling.style.cursor = null
    theDiv.firstChild.nextSibling.id = null
  }

  // these are redunandant but added so transition looks better
  const highLightsDiv = theDiv.querySelector('.markHighlights')
  if (highLightsDiv) highLightsDiv.style.display = doExpand ? 'block' : 'none'
  const msgHighLightsDiv = theDiv.querySelector('.msgHighLights')
  if (msgHighLightsDiv) msgHighLightsDiv.style.display = doExpand ? 'block' : 'none'
  const sharingDiv = theDiv.querySelector('.sharingDetailsSkeleton')
  if (sharingDiv) sharingDiv.style.display = doExpand ? 'block' : 'none'
  const sharingTitle = theDiv.querySelector('.SharingTitle')
  if (sharingTitle) sharingTitle.style.display = doExpand ? 'block' : 'none'
  const starsOnCard = theDiv.querySelector('.starsOnCard')
  if (starsOnCard) starsOnCard.style.display = (doExpand || list === 'marks') ? 'block' : 'none'

  // When expand, look up purl to see if it has been marked. And reset 
  if (doExpand) {
    if (!vState.marks?.lookups || !vState.marks?.lookups[purl] || !vState.messages?.lookups || !vState.messages.lookups[purl]) { // ) { //
      let existing = null
      try {
        existing = await vState.environmentSpecificGetMark(purl)
      } catch (e) {
        console.warn('gotFetchErr 1 ', { e })
        gotFetchErr = true
        const sharingDiv = theDiv.querySelector('.sharingDetailsSkeleton')
        sharingDiv.appendChild(dg.div({ style: errStyle }, 'Error getting bookmarks: ' + e.message))
      }
      if (existing && (existing.mark || (existing.messages && existing.messages.length > 0))) {
        vState.marks.lookups[purl] = existing.mark

        const messages = (existing.messages && existing.messages.length > 0) ? existing.messages : null
        if (!vState.messages) vState.messages = {}
        if (!vState.messages.lookups) vState.messages.lookups = {}
        vState.messages.lookups[purl] = lister.mergeNewAndExistingMessages([], messages)[0]
      }
    }
    if (!vState.environmentSpecificGetMark) console.warn('(need to define  vState.environmentSpecificGetMark')

    const mark = vState.marks?.lookups[purl]
    const msgRecord = vState.messages?.lookups ? vState.messages.lookups[purl] : null
    const log = (list === 'history')
      ? (vState.history.unfilteredItems.find(m => m.purl === purl) || vState.history.filteredItems.find(m => m.purl === purl))
      : (list === 'tabs') ? tabRecordByPurl(purl) : null

    const logOrMsgToDraw = mark || ((list === 'history' || list === 'tabs') ? convertLogToMark(log) : convertLogToMark(msgRecord))

    const stars = overlayUtils.drawstars(logOrMsgToDraw, {
      drawTrash: (list === 'marks'),
      trashFloatHide: (list === 'marks'),
      showBookmark: !mark,
      markOnBackEnd: vState.markOnBackEnd,
      logToConvert: vState.logToConvert
    })
    const starDiv = theDiv.querySelector('.starsOnCard')
    starDiv.innerHTML = ''
    starDiv.appendChild(stars)
    if (list !== 'tabs') starDiv.style['margin-right'] = '40px'
    const trash = starDiv.querySelector('.vulog_overlay_trash')
    if (trash) trash.style.display = 'block'
    const summarySharingAndHighlights = theDiv.querySelector('.summarySharingAndHighlights')
    if (summarySharingAndHighlights) summarySharingAndHighlights.style.display = 'none' // redundant with below - added here so it happens at starts
    const notesBox = overlayUtils.drawMainNotesBox(logOrMsgToDraw, { mainNoteSaver: vState.mainNoteSaver })
    const NoteDiv = theDiv.querySelector('.vNote')
    if (NoteDiv) {
      NoteDiv.innerHTML = ''
      NoteDiv.appendChild(notesBox)
    }
    const hLightOptions = {
      type: 'markHighLights',
      purl,
      markOnBackEnd: vState.markOnBackEnd,
      markOnMarks: mark,
      hLightCommentSaver: vState.hLightCommentSaver,
      hLightDeleter: vState.hLightDeleter
    }
    if (mark?.vHighlights && mark.vHighlights.length > 0) {
      const hLightDiv = theDiv.querySelector('.markHighlights')
      hLightOptions.existingDiv = hLightDiv
      if (hLightDiv) lister.newDrawHighlights(purl, mark.vHighlights, hLightOptions) //
    }
    if (msgRecord?.vHighlights && msgRecord.vHighlights.length > 0) {
      const hLightDiv = theDiv.querySelector('.msgHighLights')
      hLightOptions.existingDiv = hLightDiv
      hLightOptions.msgRecord = msgRecord
      hLightOptions.type = 'msgHighLights'
      const hLights = markMsgHlightsAsMarked(mark?.vHighlights, msgRecord.vHighlights)
      if (hLightDiv) lister.newDrawHighlights(purl, hLights, hLightOptions) //
    }

    // DO HIGLIGHTS AND DO SHARING
  } else {
    if (list !== 'tabs') theDiv.querySelector('.starsOnCard').style['margin-right'] = '0'
  }
  if (!vState.messages) vState.messages = {}
  if (!vState.messages.unfilteredItems) vState.messages.unfilteredItems = []
  if (vState.freezrMeta?.userId && doExpand && vState.queryParams.list !== 'messages' && vState.messages?.unfilteredItems && !vState.messages.unfilteredItems.find((item) => item.purl === purl)) {
    const updateStatus = await getAllMessagesAndUpdateStateteFor(purl)
    if (updateStatus.error) console.warn('todo - Need to handle error on update') // todo - have an error box on the card and show this ??
  }
  const messageItem = vState.messages.unfilteredItems.find((item) => item.purl === purl)

  const vMessageCommentDetailsDiv = theDiv.querySelector('.vMessageCommentDetails')
  overlayUtils.vMessageCommentDetails(purl, messageItem?.vComments, vMessageCommentDetailsDiv)

  Array.from(theDiv.childNodes).forEach(el => {
    switch (el.className) {
      case 'minMaximizeButt':
        lister.minMaximizeButtSet(el, !doExpand)
        break
      case 'summarySharingAndHighlights':
        el.style.display = doExpand ? 'none' : 'grid'
        break
      case 'markHighlights':
        el.style.display = doExpand ? 'block' : 'none'
        break
      case 'msgHighLights':
        el.style.display = doExpand ? 'block' : 'none'
        break
      case 'vNote':
        el.style.display = doExpand ? 'block' : 'none'
        break
      case 'SharingTitle':
      case 'sharingDetailsSkeleton':
        el.style.display = doExpand ? 'block' : 'none' // redundant
        if (doExpand && el.className === 'sharingDetailsSkeleton') {
          setTimeout(async function () {
            if (vState.freezrMeta?.userId && doExpand && !vState.sharedmarks?.lookups[purl]) {
              if (!vState.sharedmarks) vState.sharedmarks = {}
              if (!vState.sharedmarks.lookups) vState.sharedmarks.lookups = {}
              try {
                await refreshSharedMarksinVstateFor(purl)
              } catch (e) {
                console.warn('gotFetchErr 2 ', { e })
                const sharingDiv = theDiv.querySelector('.sharingDetailsSkeleton')
                gotFetchErr = true
                sharingDiv.appendChild(dg.div({ style: errStyle }, 'Error getting public marks: ' + e.message))
              }
            }
            if (gotFetchErr) {
              console.warn({ gotFetchErr })
              lister.postErrInSharingDetails(el)
            } else {
              lister.redrawSharingDetails(el)
            }
          }, 5)
        }
        break
      case 'starsOnCard':
        el.style.display = (doExpand || list === 'marks') ? 'block' : 'none'
        break
      case 'viaReferrer':
        el.style.display = (doExpand) ? 'block' : 'none'
        break
      case 'smallStarsOnCard':
        el.style.display = (doExpand) ? 'none' : 'block'
        el.innerHTML = ''
        el.appendChild(overlayUtils.drawSmallStars(vState.marks.lookups[purl]))
        break
      case 'vMessageCommentDetails':
        el.style.display = doExpand ? 'block' : 'none'
        break
      case 'vMessageCommentSummary':
        el.style.display = doExpand ? 'none' : 'block'
        break
      default:
        break
    }
  })
}
const refreshSharedMarksinVstateFor = async function (purl) {
  vState.sharedmarks.lookups[purl] = await freepr.feps.postquery({ app_table: 'cards.hiper.freezr.sharedmarks', q: { purl } })
  return true
}

// Elements inside card
lister.addCard2ndOuter = function (cardOuter, list) {
  return dg.div({
    style: {
      margin: (list === 'tabs' ? '0' : '15px'), width: (lister.dims[list].width + 'px'), transition: 'all 0.5s ease-out'
    }
  }, cardOuter)
}
lister.cardOuter = function (markOrLog, list, expandedView) {
  if (document.getElementById(this.idFromMark(markOrLog))) console.warn('duplicateitem for ', { id: this.idFromMark(markOrLog), markOrLog})
  return dg.div({
    style: {
      height: (expandedView ? null : (lister.dims[list].height + 'px')),
      width: (lister.dims[list].width + 'px'),
      display: 'inline-block',
      border: '1px solid black',
      'border-radius': '10px',
      'background-color': 'white',
      padding: '5px',
      transition: 'all 0.5s ease-out',
      overflow: 'hidden'
    },
    id: this.idFromMark(markOrLog)
  })
}
lister.idFromMark = function (mark) {
  const type = mark?._id ? 'id' : 'temp'
  return 'vitem_' + type + '_' + (mark?._id || mark?.fj_local_temp_unique_id || ('errorGettingid'))
}
lister.domainSpanWIthRef = function (markOrLog, expandedView) {
  return dg.div({
    style: {
      overflow: 'hidden',
      color: 'darkgrey',
      'font-size': '12px',
      'font-weight': 'bold',
      height: '18px',
      'max-height': '18px'
    }
  }, lister.domainSpanWIthRefInner(markOrLog, expandedView))
}
lister.imageBox = function (image, styles, aElement) {
  // nb not tested
  if (image && image.indexOf('http') !== 0) {
    if (aElement && image.indexOf('/') === 0) {
      image = 'https//' + aElement?.hostname + '/' + image
    } else {
      image = ''
    }
  } 
  const imageBox = dg.div({ style: { 'text-align': 'center', height: '80px', padding: '5px' } }, //
    (image
      ? dg.img({ src: (image || ''), style: { 'max-width': '170px', 'max-height': '80px' } })
      : dg.div({ style: { margin: '10px 40px 10px 40px', border: '5px solid lightgrey', height: '60px' } })
    ))
  if (styles) {
    for (const [key, attr] of Object.entries(styles)) {
      imageBox.firstChild.style[key] = attr
    }
  }
  return imageBox
}
lister.domainSpanWIthRefInner = function (markOrLog, expandedView) {
  const remDotCom = function (domain) {
    if (domain && domain.length > 5 && domain.indexOf('.com') === (domain.length - 4)) domain = domain.slice(0, -4)
    if (domain && domain.length > 5 && domain.indexOf('www.') === 0) domain = domain.slice(4)
    return domain
  }
  return (dg.span(
    // favicon
    dg.span(
      dg.img({
        style: {
          'vertical-align': 'top',
          width: '15px',
          height: '15px',
          'margin-right': '5px'
        },
        src: (markOrLog.vulog_favIconUrl ? markOrLog.vulog_favIconUrl : (this.getdomain(markOrLog.url) + '/favicon.ico')),
        onerror: function () {
          this.onerror = null
          this.src = freezr?.app?.isWebBased ? '/app_files/cards.hiper.freezr/public/static/faviconGeneric.png' : '/static/faviconGeneric.png'
        }
      })
    ),
    // title
    dg.span({
      className: 'domainTitle',
      style: {
        overflow: 'hidden',
        'font-weight': 'bold',
        'font-size': '14px',
        'vertical-align': 'bottom',
        color: MCSS.DARK_GREY
      }
    },
    (remDotCom(markOrLog.domainApp)),
    dg.span({
      style: {
        overflow: 'hidden',
        'font-weight': 'normal',
        'font-size': '14px',
        'vertical-align': 'bottom',
        color: MCSS.DARK_GREY
      }
    },
    ((markOrLog.referrer && markOrLog.domainApp !== domainAppFromUrl(markOrLog.referrer)) ? (' via ' + remDotCom(domainAppFromUrl(markOrLog.referrer))) : ''
    ))
    )
  ))
}
lister.domainSpan = function (markOrLog) {
  return (dg.span(
    // favicon
    dg.span(
      dg.img({
        style: {
          'vertical-align': 'top',
          width: '15px',
          height: '15px',
          'margin-right': '5px'
        },
        src: (markOrLog.vulog_favIconUrl ? markOrLog.vulog_favIconUrl : (this.getdomain(markOrLog.url) + '/favicon.ico')),
        onerror: function () {
          this.onerror = null
          this.src = freezr?.app?.isWebBased ? '/app_files/cards.hiper.freezr/public/static/faviconGeneric.png' : '/static/faviconGeneric.png'
        }
      })
    ),
    // title
    dg.span({
      style: {
        overflow: 'hidden',
        'font-weight': 'bold',
        'font-size': '14px',
        'vertical-align': 'bottom',
        color: MCSS.DARK_GREY
      }
    },
    markOrLog.domainApp)
  ))
}
lister.titleOuter = function (expandedView) {
  return dg.div({
    style: {
      overflow: 'hidden',
      color: 'cornflowerblue',
      height: (expandedView ? null : '33px'),
      'margin-top': '5px'
    },
    className: 'vulog_title_url'
  })
}
lister.openOutside = function (url, options) {
  return dg.div({
    className: 'fa fa-external-link',
    style: { float: 'right', color: 'cornflowerblue', 'font-size': '18px', margin: (options?.nomargin ? '' : '6px 0px 0px 5px'), cursor: 'pointer' },
    onclick: (e) => {
      const left = window.screenLeft !== undefined ? window.screenLeft : window.screenX
      const top = window.screenTop !== undefined ? window.screenTop : window.screenY
      const height = window.innerHeight
        ? window.innerHeight
        : document.documentElement.clientHeight ? document.documentElement.clientHeight : screen.height
      window.open(url, 'window', 'width=800, height=' + height + ',  left =' + (left + 500) + ', top=' + top + '')
    }
  })
}
lister.newDrawHighlights = function (purl, hLights, options) {
  // options: hLightCommentSaver, hLightDeleter, existingDiv, markOnBackEnd, markOnMarks, logToConvert (eg msgRecord)
  if (options?.existingDiv) options.existingDiv.innerHTML = ''
  const innerHighs = options?.existingDiv || dg.div({ className: options.type, style: { display: 'none' } })
  if (hLights && hLights.length > 0) {
    const title = (options?.type === 'msgHighLights' ? 'Highlights in Messages 1' : 'Your Highlights')
    innerHighs.appendChild(overlayUtils.areaTitle('Highlights', { display: 'block', title, color: (options?.type === 'msgHighLights' ? 'purple' : '#057d47') }))

    const hLightOpts = JSON.parse(JSON.stringify(options))
    hLightOpts.include_delete = true
    hLightOpts.existingDiv = null
    hLightOpts.isOwn = !(options?.type === 'msgHighLights')
    hLightOpts.hLightCommentSaver = options.hLightCommentSaver
    hLightOpts.hLightDeleter = options.hLightDeleter

    if (!hLightOpts.hLightCommentSaver) console.error('No hLightOptions hLightCommentSaver 3 ', { optionscomm: JSON.stringify(options.hLightCommentSaver), hLightOptscomms: JSON.stringify(hLightOpts.hLightCommentSaver) })

    hLights.forEach(hlight => {
      innerHighs.appendChild(overlayUtils.drawHighlight(purl, hlight, hLightOpts))
    })
  } else if (!vState.freezrMeta?.userId && options?.type !== 'msgHighLights') { // ie relatively new user
    innerHighs.appendChild(overlayUtils.areaTitle('Highlights', { display: 'block', title: 'Highlights', color: (options?.type === 'msgHighLights' ? 'purple' : '#057d47') }))
    innerHighs.appendChild(dg.div({ style: { color: 'grey', padding: '10px' } }, 'You can highlight text on pages by selecting the text and right-clicking on it to see your menu options.'))
  }
  return innerHighs
}
lister.allPeopleSharedWith = function (currentMark) {
  const theSpan = dg.div({
    onclick: (e) => e.preventDefault(),
    style: { display: 'inline', cursor: 'default' }
  }, dg.span('Sharing Options'))
  let count = 0
  const sharedWith = dg.span('Shared with: ')
  if (currentMark?._accessible?._public) {
    sharedWith.appendChild(dg.span({
      style: { color: 'purple' },
      title: 'Every one has access',
      id: 'sharedWithPublicInTitle'
    },
    'the Public'))
    sharedWith.appendChild(dg.span(', '))
    count++
  }
  if (currentMark?._accessible) {
    for (const [searchName] of Object.entries(currentMark._accessible)) {
      if (searchName !== '_public') {
        sharedWith.appendChild(dg.span({
          style: { color: 'purple' },
          title: searchName
        }, searchName.split('@')[0]))
        sharedWith.appendChild(dg.span(', '))
        count++
      }
    }
  }
  // add public
  if (count > 0) { // remove comma - add period
    sharedWith.lastChild.innerText = '.'
    theSpan.firstChild.style.display = 'none'
    theSpan.appendChild(sharedWith)
  }
  return theSpan
}
// SHARING MENU and INTERACTIONS
lister.sharingDetailsSkeleton = function (purl, options) {
  const outer = dg.div({
    className: 'sharingDetailsSkeleton',
    style: {
      'min-height': (options?.minHeight || '150px'), display: 'none'
    }
  })
  // const purl = msgRecord?.purl || options?.purl
  if (!purl) return outer.appendChild(dg.div('No purl Sent to draw section'))
  outer.setAttribute('sectionDrawn', false)
  outer.setAttribute('purl', purl)

  const menuDetails = dg.div({ className: 'sharingMenuDetails', style: { padding: '10px' } })
  const summary = lister.summaryOfSharingOptions(purl, permsFromFreezrMetaState())
  if (!options || !options.hideSummary) menuDetails.appendChild(summary)
  if (vState.isLoggedIn) {
    outer.appendChild(lister.drawSharingMenuItems(purl, {}))
    SHARING_MENU_TYPES.forEach(type => menuDetails.appendChild(drawEmptySharingSubsection(type)))
  }
  outer.appendChild(menuDetails)
  setTimeout(function () { 
    expandSection(summary, { height: '180px' })
    // need to set these as 'transitioned' doesnt get triggered when hidden
    summary.style.height = null
    summary.setAttribute('data-collapsed', 'false')
  }, 100)
  return outer
}
lister.postErrInSharingDetails = function (sharingDiv) {
  sharingDiv.innerHTML = ''
  sharingDiv.appendChild(dg.div({ style: errStyle }, 'Sorry there was an error connecting to the server please try again later'))
}
const permsFromFreezrMetaState = function () {
  const { freezrMeta } = vState
  if (!freezrMeta.perms) freezrMeta.perms = { link_share: { granted: false }, friends: { granted: false } }
  const perms = { isLoggedIn: (vState.isLoggedIn) }
  perms.haveMessagingPerm = freezrMeta?.perms?.message_link?.granted
  perms.havePublicPerm = freezrMeta?.perms?.public_link?.granted
  perms.haveSharingPerm = perms.haveMessagingPerm || perms.havePublicPerm
  perms.haveFeedPerm = freezrMeta?.perms?.privateCodes?.granted
  perms.haveContactsPerm = freezrMeta?.perms?.friends?.granted
  return perms
}
lister.redrawSharingDetails = function (sharingDiv, options) {
  if (!sharingDiv) console.error('redrawSharingDetails - Try finding el using otpions.purl')
  const purl = sharingDiv.getAttribute('purl')

  const perms = permsFromFreezrMetaState()

  // find message in vState using purl
  if (!purl) {
    sharingDiv.appendChild(dg.div('Internal Error - no purl associated with this.'))
  } else if (!vState.isLoggedIn) {
    sharingDiv.appendChild(dg.div('. . .')) // todo -> login link if on extension
  } else if (vState.offlineCredentialsExpired) {
    sharingDiv.appendChild(dg.div('Your credentials have expired. Please login again.')) // todo -> login link if on extension
  } else {
    if (perms.isLoggedIn) {
      SHARING_MENU_TYPES.forEach(type => drawSharingSubsection[type](purl, { existingDiv: sharingDiv.querySelector('.sharingArea' + type) }))
    }
  }
  return sharingDiv
}
const SHARING_MENU_TYPES = ['_public', '_privatelink', '_messages', '_privatefeed']
lister.drawSharingMenuItems = function (purl, perms) {
  const outer = dg.div({ className: 'sharingMenuItems', style: { 'text-align': 'center' } })
  SHARING_MENU_TYPES.forEach(shareType => { outer.appendChild(shareMenuButton(shareType, purl, perms)) })
  return outer
}
const shareButtStyle = {
  display: 'inline-block',
  'text-align': 'center',
  'border-radius': '6px',
  border: '2px solid',
  'font-size': '11px',
  color: 'cornflowerblue',
  padding: '4px',
  margin: '3px',
  'min-width': '40px',
  width: '70px',
  cursor: 'pointer' // , position: ;relative
}
const shareMenuButton = function (shareType, purl, perms) {
  const theButton = dg.div({
    className: 'shareMenuButton',
    style: shareButtStyle,
    onclick: function (e) {
      const actualButton = getParentWithClass(e.target, 'shareMenuButton')
      const chosenShareType = actualButton.getAttribute('shareType')
      const sharingButtonsDiv = actualButton.parentElement
      Array.from(sharingButtonsDiv.childNodes).forEach(el => {
        const buttonShareType = el.getAttribute('shareType')
        el.style.color = (buttonShareType === chosenShareType) ? 'grey' : 'cornflowerblue'
        el.style.border = (buttonShareType === chosenShareType) ? '' : '2px solid'
        el.style.cursor = (buttonShareType === chosenShareType) ? 'normal' : 'pointer'
      })
      const sharingDetailsOuter = sharingButtonsDiv.nextSibling
      let elToExpand = null
      let didCollapseOne = false

      Array.from(sharingDetailsOuter.childNodes).forEach(el => {
        const detailsShareType = el.getAttribute('shareType')
        if (detailsShareType !== chosenShareType) {
          const didCollpaseThisOne = collapseIfExpanded(el)
          didCollapseOne = didCollapseOne || didCollpaseThisOne
        } else {
          elToExpand = el
        }
      })
      if (!elToExpand) console.warn('no eltoexpand')
      if (elToExpand.getAttribute('vStateChanged') === 'true') {
        elToExpand.setAttribute('vStateChanged', false)

        drawSharingSubsection[chosenShareType](purl, { existingDiv: elToExpand })
      }
      setTimeout(function () {
        if (elToExpand) expandSection(elToExpand)
      }, (didCollapseOne ? 500 : 0)) // at start, on popup there is no eltoexpand
    }
  }, spanIconForShareType(shareType), titleTextFor(shareType))
  theButton.setAttribute('shareType', shareType)
  return theButton
}
const titleTextFor = function (shareType) {
  return (shareType === '_public'
    ? 'Public'
    : (shareType === '_privatelink'
        ? 'Private'
        : (shareType === '_privatefeed'
            ? 'Feed'
            : (shareType === '_messages'
                ? 'Message'
                : 'UNKNOWN'
              ))))
}
const spanIconForShareType = function (shareType) {
  if (shareType === '_public') return dg.span({ style: { margin: '0 3px 0 3px' } }, dg.span({ className: 'fa fa-link' }))
  if (shareType === '_messages') return dg.span({ style: { margin: '0 3px 0 3px' } }, dg.span({ className: 'fa fa-comment-o' }))
  if (shareType === '_privatelink') return dg.span({ style: { margin: '0px 2px', padding: '0px 3px', height: '12px', border: '1px solid', 'border-radius': '8px' } }, dg.span({ className: 'fa fa-link', style: { 'font-size': '12px' } }))
  if (shareType === '_privatefeed') return dg.span({ style: { margin: '0px 2px', padding: '0px 3px', height: '11px', border: '1px solid', 'border-radius': '3px', 'border-top': '3px double' } }, dg.span({ className: 'fa fa-users', style: { 'font-size': '10px' } }))

  return dg.span({ style: { margin: '0px 3px 0 3px', padding: '0px 3px', height: '12px', border: '1px solid', 'border-radius': '8px', 'border-top': '2px double' } }, dg.span({ className: 'fa fa-user', style: { 'font-size': '12px' } }))
}
lister.makePublicShareButton = function (opts) {
  const { title, buttonText, onlineAction, callback, style } = opts // successText // shareType: _public, _privatelink, _privatefeed, _messages
  const DEFAULTEXT = 'Share'

  const theButt = dg.div({
    className: 'shareButt',
    title, // (shareType !== '_public' ? (shareType !== '_privatelink' ? 'Publish to this feed' : 'Create a Private Link') : (doGrant ? 'Share Publicly' : 'unPublish'))
    style: shareButtStyle, // { 'user-select': 'none' },
    onclick: async function (e) {
      const buttonDiv = e.target
      buttonDiv.innerHTML = ''
      buttonDiv.appendChild(smallSpinner({ width: '15px', 'margin-top': '-4px', 'margin-bottom': '-4px' }))
  // dg.img({
  //       src: '/app_files/@public/info.freezr.public/public/static/ajaxloaderBig.gif',
  //       style: { width: '15px', 'margin-top': '-4px', 'margin-bottom': '-4px' }
  //     }))
      const result = await onlineAction()
      if (result?.error) {
        buttonDiv.innerHTML = buttonText || DEFAULTEXT
        buttonDiv.after(dg.div({ style: { color: 'red' } }, 'Sorry, Error: ' + (result?.error || 'unknown')))
      } else {
        buttonDiv.style.display = 'none'
        if (callback) callback()
      }
      if (callback) callback()
    }
  }, (buttonText || DEFAULTEXT))
  if (style) {
    Object.keys(style).forEach(key => { theButt.style[key] = style[key] })
  }
  return theButt
}
lister.summaryOfSharingOptions = function (purl, perms, options) {
  const outer = options?.existingDiv || dg.div({ className: 'sharingArea_summary' }) // collapsibleDiv('sharingArea_summary')
  outer.innerHTML = ''
  outer.setAttribute('shareType', 'none')

  if (!perms.isLoggedIn) {
    outer.appendChild(dg.span({ style: { color: 'darkgrey' } }, 'Connect to a freezr server to be able to share your bookmarks, notes and highlights. '))
    outer.appendChild(dg.a({ href: 'https://www.freezr.info' }, 'Cleck here to find out more about setting up a freezr server.'))
    outer.appendChild(dg.div(dg.br(), dg.div({ style: { 'color': 'grey' } }, dg.span('If you already have a feezr server, log in '), dg.a({ href: '/main/settings.html' }, 'on the setting page.'))))
    return outer
  }
  outer.appendChild(dg.br())
  const havePublicPerm = perms.havePublicPerm

  // Public Summary
  const publicMark = getPublicMark(purl)
  const publicUrl = getPublicUrl(publicMark)
  const hrefCore = (vState.isExtension ? (vState.freezrMeta?.serverAddress || 'https://freezr.info') : '')
  if (!havePublicPerm) {
    outer.appendChild(dg.div(dg.span({ style: { 'font-weight': 'bold' } }, 'Public: '), dg.span('You can publish your bookmark by granting '), dg.a({ href: hrefCore +'/account/app/settings/cards.hiper.freezr' }, 'the link_share permission')))
  } else if (publicMark) {
    outer.appendChild(dg.div(dg.span({ style: { 'font-weight': 'bold' } }, 'Public: '), dg.span(('Your bookmark was published.'), dg.a({ href: hrefCore + '/' + publicUrl }, 'You can find it here.'), dg.span(' Press the Public button for more options.'))))
  } else {
    outer.appendChild(dg.div(dg.span({ style: { 'font-weight': 'bold' } }, 'Public: '), 'Press on the Public button to publish this bookmark. '))
  }

  // Private Summary
  const privateMark = getPrivateMark(purl)
  const privateUrl = getPrivateUrl(privateMark)
  outer.appendChild(dg.br())
  if (!havePublicPerm) {
    outer.appendChild(dg.div(dg.span({ style: { 'font-weight': 'bold' } }, 'Private Sharing: '), dg.span('You can create a private link, protected b a code, to your bookmark by granting '), dg.a({ href: hrefCore + '/account/app/settings/cards.hiper.freezr' }, 'the link_share permission.')))
  } else if (privateMark) {
    outer.appendChild(dg.div(dg.span({ style: { 'font-weight': 'bold' } }, 'Private Sharing: '), dg.span(('A private link has been created for your bookmark.'), dg.a({ href: hrefCore + '/' + privateUrl }, 'You can find it here.'), dg.span(' Press the Private button for more options.'))))
  } else {
    outer.appendChild(dg.div(dg.span({ style: { 'font-weight': 'bold' } }, 'Public: '), 'Press on the Private button to create a private link to this bookmark - this will be a publicly accessible url oritected b a simple code.. '))
  }

  // Messaging Summary
  outer.appendChild(dg.br())
  outer.appendChild(dg.div(dg.span({ style: { 'font-weight': 'bold' } }, 'Messaging: '), dg.span('Share your bookmark with your contacts ')))

  // Feed Summary
  outer.appendChild(dg.br())
  outer.appendChild(dg.div(dg.span({ style: { 'font-weight': 'bold' } }, 'Private Feed: '), dg.span('Share your bookmark with your contacts ')))

  // outer.style.height = '180px'
  // outer.style.transition = 'height 0.3s ease-out'
  // outer.setAttribute('data-collapsed', 'false')

  return outer
}
const drawEmptySharingSubsection = function (type) {
  const outer = collapsibleDiv('sharingArea' + type)
  outer.innerHTML = ''
  outer.setAttribute('shareType', type)
  return outer
}
const drawSharingSubsection = {}
drawSharingSubsection._public = function (purl, options) {
  // options: existingDiv log
  const perms = permsFromFreezrMetaState()

  const outer = options?.existingDiv || collapsibleDiv('sharingArea_public')
  outer.innerHTML = ''
  outer.setAttribute('shareType', '_public')

  if (!perms.havePublicPerm) {
    const href = (vState.isExtension ? (vState.freezrMeta?.serverAddress || 'https://freezr.info') : '')  + '/account/app/settings/cards.hiper.freezr'
    outer.appendChild(dg.div({ style: { padding: '5px' } }, dg.div('You need to grant the app permission to share links with others.'), dg.a({ href }, 'Press here to grant the link_share permission.')))
    return outer
  }

  const mark = vState.marks.lookups[purl]
  const publicMark = getPublicMark(purl)
  const isPublished = hasPublicMark(purl)
  const publicUrl = getPublicUrl(publicMark)
  const publishDate = getPublishDate(publicMark, '_public')

  if (isPublished) {
    const messageBox = overlayUtils.editableBox({
      placeHolderText: 'Enter notes on the page'
    }, async function (e) {
    })
    if (publicMark.vComments && publicMark.vComments.length > 0) {
      messageBox.innerText = publicMark.vComments[0].text
    } else if (mark?.vNote) {
      messageBox.innerText = mark.vNote
    }
    messageBox.onpaste = convertPasteToText
    messageBox.className = 'messageBox vulog_overlay_input'
    messageBox.style.border = '1px solid lightgrey'
    messageBox.style['max-height'] = 'none'

    if (publicUrl) {
      outer.appendChild(dg.div(dg.span(('Your bookmark was made public on ' + new Date(publishDate).toLocaleDateString() + '.'), dg.span(' You can find it '), dg.a({ href: vState.freezrMeta.serverAddress + '/' + publicUrl, target: '_blank' }, 'here.'), dg.span(' You can republish the current mark below, or delete it.'))))
      outer.appendChild(messageBox)
    } else {
      outer.appendChild(dg.div(dg.span(('There seems to have been issues. Your bookmaark was made public on ' + new Date(publicMark._date_modified).toLocaleDateString() + ', but it seems the operation was incompete.. '), dg.span(' You can republish the current mark below, or delete it to retry.'))))
    }

    outer.appendChild(dg.br())

    const buttons = dg.div({ style: { 'text-align': 'center' } })
    buttons.appendChild(lister.makePublicShareButton(
      {
        buttonText: 'Republish',
        title: 'Republish the link',
        successText: 'You have re-published this!',
        onlineAction: async function () {
          try {
            // get item with isPublic from sharedMarks
            // todo check if there are multiple and if so delete
            // also check if accessible if not, give an error
            const newMark = convertMarkToSharable((mark || getMarkFromVstateList(purl, { excludeHandC: true })), { excludeHlights: !mark })
            newMark.vComments = []
            if (messageBox.innerText) newMark.vComments = [{ text: messageBox.innerText, vCreated: new Date().getTime() }]
            newMark.vSearchString = resetVulogKeyWords(newMark)
            newMark._id = publicMark._id
            const updateRet = await freepr.feps.update(newMark, { app_table: 'cards.hiper.freezr.sharedmarks' })
            if (!updateRet || updateRet.error) throw new Error('Error updating shared mark: ' + (updateRet?.error || 'unknown'))
            const shareRet = await freepr.perms.shareRecords(publicMark._id, { grantees: ['_public'], name: 'public_link', action: 'grant', table_id: 'cards.hiper.freezr.sharedmarks' })
            if (!shareRet || shareRet.error) throw new Error('Error sharing: ' + (shareRet?.error || 'unknown'))
            outer.innerHTML = ''
            outer.appendChild(dg.div(
              dg.div({ style: { padding: '10px', color: 'red' } }, 'Your bookmark was republished.'), 
              dg.a({ style: { margin: '10px' }, href: vState.freezrMeta.serverAddress + '/@' + vState.freezrMeta.userId + '/cards.hiper.freezr.sharedmarks/' + newMark._id, target: '_blank' }, 'You can find it here.')
            ))
            await refreshSharedMarksinVstateFor(purl)
            outer.setAttribute('vStateChanged', 'true')
            return shareRet
          } catch (e) {
            outer.appendChild(dg.div({ style: { padding: '10px', color: 'red' } }, 'There was an error republishing. Please try again.'))
            console.warn('caught err in online action', { e })
            return { error: e?.error }
          }
        }
      }
    ))
    // ADD DELETE BUTTON using makePublicShareButton
    buttons.appendChild(dg.span({ style: { 'padding-left': '100px' } }, ' '))
    buttons.appendChild(lister.makePublicShareButton(
      {
        title: 'Remove the link',
        buttonText: 'Remove',
        style: { color: 'red' },
        onlineAction: async function () {
          try {
            if (!publicMark) throw new Error('No public mark found')
            const shareRet = await freepr.perms.shareRecords(publicMark._id, { grantees: ['_public'], name: 'public_link', action: 'deny', table_id: 'cards.hiper.freezr.sharedmarks' })
            if (!shareRet || shareRet.error) throw new Error('Error in shareRecords of mark: ' + (shareRet?.error || 'unknown'))

            const deleteRet = await freepr.feps.delete(publicMark._id, { app_table: 'cards.hiper.freezr.sharedmarks' })
            if (!deleteRet || deleteRet.error) throw new Error('Error updating shared mark: ' + (deleteRet?.error || 'unknown'))
            if (deleteRet.success) {
              outer.innerHTML = ''
              outer.appendChild(dg.div({ style: { padding: '10px', color: 'red' } }, 'Your bookmark was unpublished.'))
              await refreshSharedMarksinVstateFor(purl)
              outer.setAttribute('vStateChanged', 'true')
            }
            return deleteRet
          } catch (e) {
            console.warn('caught err in online action', { e })
            outer.appendChild(dg.div({ style: { padding: '10px', color: 'red' } }, 'There was an error removing the link. Please try again.'))
            return { error: e?.error }
          }
        }
      }
    ))
    outer.appendChild(buttons)
    // add spinners and padding
  } else {
    outer.appendChild(dg.div('You can make your link public. It will show up on your public page and you can share the link wih any one. Your highlights and initial hilight comments will also be shared.'))
    const messageBox = overlayUtils.editableBox({
      placeHolderText: 'Enter notes on the page'
    }, async function (e) {
    })
    if (mark?.vNote) messageBox.innerText = mark.vNote
    messageBox.onpaste = convertPasteToText
    messageBox.className = 'messageBox vulog_overlay_input'
    messageBox.style.border = '1px solid lightgrey'
    messageBox.style['max-height'] = 'none'
    outer.appendChild(messageBox)
    const button = lister.makePublicShareButton(
      {
        title: 'Share the link publicly',
        buttonText: 'Share Publicly',
        successText: 'You have published this!',
        onlineAction: async function () {
          try {
            const markCopy = convertMarkToSharable((mark || getMarkFromVstateList(purl, { excludeHandC: true })), { excludeHlights: !mark }) // currently excluding hLights
            if (messageBox.innerText) markCopy.vComments = [{ text: messageBox.innerText, vCreated: new Date().getTime() }]
            if (!markCopy) throw new Error('No mark or log to convert')
            markCopy.isPublic = true
            markCopy.vSearchString = resetVulogKeyWords(markCopy)
            // deal with case of crashing here - isPublic is true but it is not shared.
            const createRet = await freepr.ceps.create(markCopy, { app_table: 'cards.hiper.freezr.sharedmarks' })
            if (!createRet || createRet.error) throw new Error('Error creating shared mark: ' + (createRet?.error || 'unknown'))
            markCopy._id = createRet._id

            const shareRet = await freepr.perms.shareRecords(createRet._id, { grantees: ['_public'], name: 'public_link', action: 'grant', table_id: 'cards.hiper.freezr.sharedmarks' })
            vState.sharedmarks.lookups[purl].push(createRet)
            outer.innerHTML = ''
            outer.appendChild(dg.div(
              dg.div({ style: { padding: '10px', color: 'red' } }, 'Your bookmark was published.'),
              dg.a({ style: { margin: '10px' }, href: vState.freezrMeta.serverAddress + '/@' + vState.freezrMeta.userId + '/cards.hiper.freezr.sharedmarks/' + createRet._id, target: '_blank' }, 'You can find it here.')
            ))
            await refreshSharedMarksinVstateFor(purl)
            outer.setAttribute('vStateChanged', 'true')
            return shareRet
          } catch (e) {
            outer.appendChild(dg.div({ style: { padding: '10px', color: 'red' } }, 'There was an error publishing. Please try again.'))
            console.warn('caught err in online action', { e })
            return { error: e?.error }
          }
        }
      })
    button.style.width = '150px'
    const holder = dg.div({ style: { 'text-align': 'center' } })
    holder.appendChild(button)
    outer.appendChild(holder)
  }

  return outer
}
drawSharingSubsection._privatelink = function (purl, options) {
  const perms = permsFromFreezrMetaState()
  const outer = options?.existingDiv || collapsibleDiv('sharingArea_privatelink')
  outer.innerHTML = ''
  outer.setAttribute('shareType', '_privatelink')
  const hrefCore = (vState.isExtension ? (vState.freezrMeta?.serverAddress || 'https://freezr.info') : '')

  if (!perms.havePublicPerm) {
    const href = hrefCore +  '/account/app/settings/cards.hiper.freezr'
    outer.appendChild(dg.div({ style: { padding: '5px' } }, dg.div('You need to grant the app permission to share links with others.'), dg.a({ href }, 'Press here to grant the link_share permission.')))
    return outer
  }

  const mark = vState.marks.lookups[purl]
  const privateMark = getPrivateMark(purl)
  const privateUrl = getPrivateUrl(privateMark)
  const publishDate = getPublishDate(privateMark, '_privatelink')

  if (privateMark) {
    const messageBox = overlayUtils.editableBox({
      placeHolderText: 'Enter notes on the page'
    }, async function (e) {
    })
    if (privateMark.vComments && privateMark.vComments.length > 0) {
      messageBox.innerText = privateMark.vComments[0].text
    } else if (mark?.vNote) {
      messageBox.innerText = mark.vNote
    }
    messageBox.onpaste = convertPasteToText
    messageBox.className = 'messageBox vulog_overlay_input'
    messageBox.style.border = '1px solid lightgrey'
    messageBox.style['max-height'] = 'none'

    if (privateUrl) {
      outer.appendChild(dg.div(dg.span(('You created a private link to this bookmark on ' + new Date(publishDate).toLocaleDateString() + '.'), dg.span(' You can find it '), dg.a({ href: hrefCore + '/' + privateUrl }, 'here.'), dg.span(' You can republish the current mark below, or delete it.'))))
      outer.appendChild(messageBox)
    } else {
      outer.appendChild(dg.div(dg.span(('There seems to have been issues. A private link was created on ' + new Date(privateMark._date_modified).toLocaleDateString() + ', but it seems the operation was incompete.'), dg.span(' You can republish the current mark below, or delete it to retry.'))))
    }

    outer.appendChild(dg.br())

    const buttons = dg.div({ style: { 'text-align': 'center' } })
    buttons.appendChild(lister.makePublicShareButton(
      {
        buttonText: 'Republish',
        title: 'Republish the link',
        successText: 'You have re-published this! Press the Public button again to continue.',
        onlineAction: async function () {
          try {
            privateMark.vComments = []
            if (messageBox.innerText) privateMark.vComments = [{ text: messageBox.innerText, vCreated: new Date().getTime() }]
            const updateRet = await freepr.feps.update(privateMark, { app_table: 'cards.hiper.freezr.sharedmarks' })
            if (!updateRet || updateRet.error) throw new Error('Error updating shared mark: ' + (updateRet?.error || 'unknown'))
            const shareRet = await freepr.perms.shareRecords(privateMark._id, { grantees: ['_privatelink'], name: 'public_link', action: 'grant', table_id: 'cards.hiper.freezr.sharedmarks' })
            if (!shareRet || shareRet.error) throw new Error('Error sharing: ' + (shareRet?.error || 'unknown'))
            outer.innerHTML = ''
            outer.appendChild(dg.div({ style: { padding: '10px', color: 'red' } }, 'Your bookmark was republished. You can access it here'))
            await refreshSharedMarksinVstateFor(purl)
            outer.setAttribute('vStateChanged', 'true')
            return shareRet
          } catch (e) {
            outer.appendChild(dg.div({ style: { padding: '10px', color: 'red' } }, 'There was an error republishing. Please try again.'))
            console.warn('caught err in online action', { e })
            return { error: e?.error }
          }
        }
      }
    ))
    // ADD DELETE BUTTON using makePublicShareButton
    buttons.appendChild(dg.span({ style: { 'padding-left': '100px' } }, ' '))
    buttons.appendChild(lister.makePublicShareButton(
      {
        title: 'Remove the link',
        buttonText: 'Remove',
        successText: 'You have re-published this! Press the Private button again to continue.',
        style: { color: 'red' },
        onlineAction: async function () {
          try {
            if (!privateMark) throw new Error('No public mark found')
            const shareRet = await freepr.perms.shareRecords(privateMark._id, { grantees: ['_privatelink'], name: 'public_link', action: 'deny', table_id: 'cards.hiper.freezr.sharedmarks' })
            if (!shareRet || shareRet.error) throw new Error('Error in shareRecords of mark: ' + (shareRet?.error || 'unknown'))
            const deleteRet = await freepr.feps.delete(privateMark._id, { app_table: 'cards.hiper.freezr.sharedmarks' })
            if (!deleteRet || deleteRet.error) throw new Error('Error updating shared mark: ' + (deleteRet?.error || 'unknown'))
            if (deleteRet.success) {
              outer.innerHTML = ''
              outer.appendChild(dg.div({ style: { padding: '10px', color: 'red' } }, 'Your private link was removed.'))
              // remove deleted item from state:
              await refreshSharedMarksinVstateFor(purl)
              outer.setAttribute('vStateChanged', 'true')
            }
            return deleteRet
          } catch (e) {
            outer.appendChild(dg.div({ style: { padding: '10px', color: 'red' } }, 'There was an error remvoing the link. Please try again.'))
            console.warn('caught err in online action', { e })
            return { error: e?.error }
          }
        }
      }
    ))
    outer.appendChild(buttons)
    // add spinners and padding
  } else {
    outer.appendChild(dg.div('You can create a private link to this bookmark so you can share a link with your contacts without forcing them to sign up for vulog. Your highlights and initial hilight comments will also be shared.'))
    const messageBox = overlayUtils.editableBox({
      placeHolderText: 'Enter notes on the page'
    }, async function (e) {
    })
    if (mark?.vNote) messageBox.innerText = mark.vNote
    messageBox.onpaste = convertPasteToText
    messageBox.className = 'messageBox vulog_overlay_input'
    messageBox.style.border = '1px solid lightgrey'
    messageBox.style['max-height'] = 'none'
    outer.appendChild(messageBox)
    const button = lister.makePublicShareButton(
      {
        title: 'Create a private link',
        buttonText: 'Create Link',
        successText: 'Your link was created. Press the Private button again to continue.',
        onlineAction: async function () {
          const markCopy = convertMarkToSharable((mark || getMarkFromVstateList(purl, { excludeHandC: true })), { excludeHlights: !mark })
          if (messageBox.innerText) markCopy.vComments = [{ text: messageBox.innerText, vCreated: new Date().getTime() }]
          try {
            if (!markCopy) throw new Error('No mark or log to convert')

            markCopy.isPublic = false
            // deal with case of crashing here - isPublic is true but it is not shared.
            const createRet = await freepr.ceps.create(markCopy, { app_table: 'cards.hiper.freezr.sharedmarks' })
            if (!createRet || createRet.error) throw new Error('Error creating shared mark: ' + (createRet?.error || 'unknown'))
            markCopy._id = createRet._id

            const shareRet = await freepr.perms.shareRecords(createRet._id, { grantees: ['_privatelink'], name: 'public_link', action: 'grant', table_id: 'cards.hiper.freezr.sharedmarks' })
            vState.sharedmarks.lookups[purl].push(createRet)
            outer.innerHTML = ''
            outer.appendChild(dg.div({ style: { padding: '10px', color: 'red' } }, dg.span('You created a shared bookmark.'), dg.a({ href: (hrefCore + '/' + shareRet._publicid + '?code=' + shareRet.code) }, 'Access it here.')))
            await refreshSharedMarksinVstateFor(purl)
            outer.setAttribute('vStateChanged', 'true')
            return shareRet
          } catch (e) {
            outer.appendChild(dg.div({ style: { padding: '10px', color: 'red' } }, 'There was an error creating the link. Please try again.'))
            console.warn('caught err in online action', { e })
            return { error: e?.error }
          }
        }
      })
    button.style.width = '150px'
    const holder = dg.div({ style: { 'text-align': 'center' } })
    holder.appendChild(button)
    outer.appendChild(holder)
  }
  return outer
}
drawSharingSubsection._privatefeed = function (purl, options) {
  const perms = permsFromFreezrMetaState()
  const outer = options?.existingDiv || collapsibleDiv('sharingArea_privatefeed')
  outer.innerHTML = ''
  outer.setAttribute('shareType', '_privatefeed')

  if (!perms.havePublicPerm || !perms.haveFeedPerm) {
    const href = (vState.isExtension ? (vState.freezrMeta?.serverAddress || 'https://freezr.info') : '') +  '/account/app/settings/cards.hiper.freezr'
    outer.appendChild(dg.div({ style: { padding: '5px' } }, dg.div('You need to grant two permission to post to feeds - both a public sharing permission and a permission to read your feeds.'), dg.a({ href }, 'Press here to grant the link_share permission.')))
    return outer
  }

  const mark = vState.marks.lookups[purl]
  // const feedNames = vState.feedcodes.map(f => f.name)

  if (!vState.feedcodes || vState.feedcodes.length === 0) {
    if (vState.isExtension) {
      outer.appendChild(dg.div(dg.span('You need to create a feed to share with others.'), dg.a({ href: (vState.freezrMeta?.serverAddress || 'https://freezr.info') + '/account/contacts' }, 'Press here to go to your contacts page and press other options..'), dg.a({ href: '/main/settings.html' }, 'Or if you just created a feed go to settings to sync with your server, or refresh this page..')))
    } else {
      outer.appendChild(dg.div(dg.span('You need to create a feed to share with others.'), dg.a({ href: '/account/contacts' }, 'Press here to go to your contacts page and press other options..')))
    }
  } else {
    outer.appendChild(dg.div('You can add specific bookmarks to your private feeds.'))
    vState.feedcodes.forEach(feedCode => {
      const feedName = feedCode.name
      const feedDiv = dg.div()
      const feedMark = getFeedMark(purl, feedName)
      if (!feedMark) {
        const button = lister.makePublicShareButton(
          {
            title: 'Post bookmark to feed',
            buttonText: 'Post to ' + feedName,
            onlineAction: async function () {
              try {
                const buttonHolder = button.parentElement
                buttonHolder.innerHTML = ''

                const markCopy = convertMarkToSharable((mark || getMarkFromVstateList(purl, { excludeHandC: true })), { excludeHlights: !mark })
                if (!markCopy) throw new Error('No mark or log to convert')
                markCopy.isPublic = false
                // deal with case of crashing here - isPublic is true but it is not shared.
                const createRet = await freepr.ceps.create(markCopy, { app_table: 'cards.hiper.freezr.sharedmarks' })
                if (!createRet || createRet.error) throw new Error('Error creating shared mark: ' + (createRet?.error || 'unknown'))
                markCopy._id = createRet._id

                const shareRet = await freepr.perms.shareRecords(createRet._id, { grantees: ['_privatefeed:' + feedName], name: 'public_link', action: 'grant', table_id: 'cards.hiper.freezr.sharedmarks' })
                vState.sharedmarks.lookups[purl].push(createRet)
                const href = (vState.isExtension ? (vState.freezrMeta?.serverAddress || 'https://freezr.info') : '') + ('/public?feed=' + feedName + '&code=' + shareRet.privateFeedCode)
                buttonHolder.appendChild(dg.div({ style: { padding: '10px', color: 'red' } }, dg.span('Posted to '), dg.a({ href }, 'feed!')))
                await refreshSharedMarksinVstateFor(purl)
                outer.setAttribute('vStateChanged', 'true') 
                return shareRet
              } catch (e) {
                outer.appendChild(dg.div({ style: { padding: '10px', color: 'red' } }, 'There was an error posting the link. Please try again.'))
                console.warn('caught err in online action', { e })
                return { error: e?.error }
              }
            }
          }
        )
        button.style.width = '150px'
        const holder = dg.div({ style: { display: 'grid', 'grid-template-columns': '1fr 180px' } })
        holder.appendChild(dg.span({ style: { 'font-weight': 'bold' } }, feedName + ':'))
        holder.appendChild(dg.div({ style: { 'text-align': 'right' } }, button))
        feedDiv.appendChild(holder)
      } else { // feedMark exists
        const updateButt = lister.makePublicShareButton({
          buttonText: 'Post again',
          title: 'Post link again to ' + feedName,
          onlineAction: async function () {
            const buttonHolder = updateButt.parentElement
            try {
              const updateRet = await freepr.feps.update(feedMark, { app_table: 'cards.hiper.freezr.sharedmarks' })
              buttonHolder.innerHTML = ''

              if (!updateRet || updateRet.error) throw new Error('Error updating shared mark: ' + (updateRet?.error || 'unknown'))
              const shareRet = await freepr.perms.shareRecords(feedMark._id, { grantees: ['_privatefeed:' + feedName], name: 'public_link', action: 'grant', table_id: 'cards.hiper.freezr.sharedmarks' })
              if (!shareRet || shareRet.error) throw new Error('Error sharing: ' + (shareRet?.error || 'unknown'))
              buttonHolder.appendChild(dg.div({ style: { padding: '10px', color: 'red' } }, 'Reposted!!'))
              await refreshSharedMarksinVstateFor(purl)
              outer.setAttribute('vStateChanged', 'true')
              return shareRet
            } catch (e) {
              buttonHolder?.parentElement?.parentElement?.appendChild(dg.div({ style: { padding: '10px', color: 'red' } }, 'There was an error reposting to your feed. Please try again.'))
              console.warn('caught err in online action', { e })
              return { error: e?.error }
            }
          }
        })
        const deleteButt = lister.makePublicShareButton({
          title: 'Remove from feed',
          buttonText: 'Remove',
          style: { color: 'red' },
          onlineAction: async function () {
            const buttonHolder = deleteButt.parentElement
            try {
              if (!feedMark) throw new Error('No public mark found')
              buttonHolder.innerHTML = ''
              const shareRet = await freepr.perms.shareRecords(feedMark._id, { grantees: ['_privatefeed:' + feedName], name: 'public_link', action: 'deny', table_id: 'cards.hiper.freezr.sharedmarks' })
              if (!shareRet || shareRet.error) throw new Error('Error sharing: ' + (shareRet?.error || 'unknown'))
              const deleteRet = await freepr.feps.delete(feedMark._id, { app_table: 'cards.hiper.freezr.sharedmarks' })
              if (!deleteRet || deleteRet.error) throw new Error('Error sharing: ' + (deleteRet?.error || 'unknown'))
              if (!deleteRet || deleteRet.error) throw new Error('Error updating shared mark: ' + (deleteRet?.error || 'unknown'))
              if (deleteRet.success) {
                buttonHolder.appendChild(dg.div({ style: { padding: '10px', color: 'red' } }, 'Removed!'))
                buttonHolder.nextSibling.innerHTML = ''
                // remove deleted item from state:
                await refreshSharedMarksinVstateFor(purl)
                outer.setAttribute('vStateChanged', 'true')
              }
              return deleteRet
            } catch (e) {
              buttonHolder.parentElement.parentElement.appendChild(dg.div({ style: { padding: '10px', color: 'red' } }, 'There was an error remvoing the link. Please try again.'))
              console.warn('caught err in online action', { e })
              return { error: e?.error }
            }
          }
        })

        const holder = dg.div({ style: { display: 'grid', 'grid-template-columns': '1fr 1fr 1fr' } })
        holder.appendChild(dg.span({ style: { 'font-weight': 'bold' } }, feedName + ':'))
        holder.appendChild(dg.div({ style: { 'text-align': 'right' } }, deleteButt))
        holder.appendChild(dg.div({ style: { 'text-align': 'right' } }, updateButt))
        feedDiv.appendChild(holder)
      }
      outer.appendChild(feedDiv)
    })
  }
  return outer
}
drawSharingSubsection._messages = function (purl, options) {
  const perms = permsFromFreezrMetaState()
  const outer = options?.existingDiv || collapsibleDiv('sharingArea_messages')
  outer.innerHTML = ''
  outer.setAttribute('shareType', '_messages')

  if (!perms.haveMessagingPerm || !perms.haveContactsPerm) {
    const innerPerms = dg.span()
    if ((!perms.haveMessagingPerm && perms.haveContactsPerm) || (perms.haveMessagingPerm && !perms.haveContactsPerm)) innerPerms.innerText = 'You have only granted one of the two permissions'
    const href = (vState.isExtension ? (vState.freezrMeta?.serverAddress || 'https://freezr.info') : '') +  '/account/app/settings/cards.hiper.freezr'
    outer.appendChild(dg.div({ style: { padding: '5px' } }, innerPerms, dg.div('You need to grant two permission to send messages.'), dg.a({ href }, 'Press here to grant   permissions.')))
    return outer
  }

  if (!vState.friends || vState.friends.length === 0) {
    const href = (vState.isExtension ? (vState.freezrMeta?.serverAddress || 'https://freezr.info') : '') + '/account/contacts'
    outer.appendChild(dg.div(dg.span('You have no contacts. ;( ...'), dg.a({ href }, 'Press here to add contacts..')))
  } else {
    overlayUtils.setUpMessagePurlWip(purl)

    outer.appendChild(overlayUtils.redrawFriendScrollerFor(purl))
    // recolorFriendScrollerFor(purl, outer)
    outer.appendChild(overlayUtils.redrawSendMessagePaneFor(purl))
  }
  return outer
}
const hasPublicMark = function (purl) {
  if (!purl) return false
  const sharedMarksList = vState.sharedmarks?.lookups ? vState.sharedmarks.lookups[purl] : null
  // takes a list of queried sharedmakrks to see if any are public
  if (!sharedMarksList || sharedMarksList.length === 0) return false
  return sharedMarksList.some(mark => mark.isPublic)
}
const getPublicMark = function (purl) {
  const sharedMarksList = vState.sharedmarks?.lookups ? vState.sharedmarks.lookups[purl] : null
  // takes a list of queried sharedmakrks to see if any are public
  if (!sharedMarksList || sharedMarksList.length === 0) return null
  return sharedMarksList.find(m => m.isPublic)
}
const getPublicUrl = function (publicMark) {
  if (publicMark?._accessible?._public && publicMark._accessible._public['cards_hiper_freezr/public_link']?.granted) return publicMark._accessible._public['cards_hiper_freezr/public_link'].public_id
  return null
}
const getPrivateMark = function (purl) {
  if (!purl) return false
  const sharedMarksList = vState.sharedmarks?.lookups ? vState.sharedmarks.lookups[purl] : null
  // takes a list of queried sharedmakrks to see if any are public
  if (!sharedMarksList || sharedMarksList.length === 0) return null
  return sharedMarksList.find(mark => (!mark.isPublic && mark._accessible?._privatelink && mark._accessible._privatelink['cards_hiper_freezr/public_link']?.granted))
}
const getPrivateUrl = function (privateMark) {
  const grantedAccessible = (privateMark?._accessible?._privatelink && privateMark._accessible._privatelink['cards_hiper_freezr/public_link']?.granted)
  if (!grantedAccessible) return null

  const accessibleObj = privateMark._accessible._privatelink['cards_hiper_freezr/public_link']
  const code = (accessibleObj.codes && accessibleObj.codes.length > 0) ? accessibleObj.codes[0] : null
  if (!code) return null
  return accessibleObj.public_id + '?code=' + code
}
const getFeedMark = function (purl, feedName) {
  if (!purl) return false
  const sharedMarksList = vState.sharedmarks?.lookups ? vState.sharedmarks.lookups[purl] : null
  // takes a list of queried sharedmakrks to see if any are public
  if (!sharedMarksList || sharedMarksList.length === 0) return null
  return sharedMarksList.find(mark => (
    !mark.isPublic &&
    mark._accessible?._privatefeed &&
    mark._accessible._privatefeed['cards_hiper_freezr/public_link']?.granted &&
    mark._accessible._privatefeed['cards_hiper_freezr/public_link']?.names.indexOf(feedName) > -1
  ))
}
const getPublishDate = function (sharedMark, type) {
  if (sharedMark?._accessible && sharedMark?._accessible[type] && sharedMark._accessible[type]['cards_hiper_freezr/public_link']?.granted) return sharedMark._accessible[type]['cards_hiper_freezr/public_link']._date_published
  return null
}
const getMarkFromVstateList = function (purl, options) {
  // options: excludeComments, excludeHLights, excludeHandC
  const list = vState.queryParams.list
  const items = (vState[list] && vState[list].unfilteredItems) ? vState[list].unfilteredItems : []
  const oneItem = items.find(item => item.purl === purl)
  if (!oneItem) return null
  if (list === 'history') return convertLogToMark(oneItem)

  if (options?.excludeHlights || options?.excludeHandC) oneItem.vHighlights = []
  if (options?.excludeComments || options?.excludeHandC) oneItem.vComments = []

  return oneItem
}

const collapsibleDiv = function (className) {
  return dg.div({
    style: { height: 0, overflow: 'hidden', transition: 'height 0.2s ease-out' },
    className
  })
}

const errStyle = {
  margin: '5px',
  padding: '5px',
  border: '2px solid red',
  color: 'red',
  'border-radius': '5px'
}
lister.minMaximizeButt = function (id) {
  const butt = dg.div({ className: 'minMaximizeButt', style: { width: '14px', height: '11px', 'border-radius': '2px', border: '1px solid cornflowerblue', float: 'right', cursor: 'pointer', 'margin-right': '3px' } })
  butt.onclick = async function () {
    await lister.setItemExpandedStatus(id)
    // try {
    // } catch (e) {
    //   console.warn('err in updating ', { e })
    // }
  }
  return butt
}
lister.minMaximizeButtSet = function (butt, showMax) {
  if (showMax) {
    butt.style['border-top'] = '4px solid cornflowerblue'
    butt.style['border-bottom'] = '1px solid cornflowerblue'
  } else {
    butt.style['border-top'] = '1px solid cornflowerblue'
    butt.style['border-bottom'] = '4px solid cornflowerblue'
  }
}

// filtering / pages
lister.filterItemsInMainDivOrGetMore = async function (source) {
  // onsole.log('filterItemsInMainDivOrGetMore')
  const mainDiv = vState.divs.main
  const list = vState.queryParams.list

  lister.endCard.showLoading()
  // if (source !== 'auto') window.scrollTo(0, 0)

  const SHOW_INCREMENTS = 20
  const MAX_AUTO_INCREMENTS = 4
  vState.loadState.source = source
  if (source !== 'auto') { vState.loadState.autoTries = 0 }
  if (source === 'initialLoad' || source === 'searchChange') {
    vState.loadState.totalShown = 0 // todo needed?
    vState.loadState.gotAll = false
    vState.shownNum = 0
    lister.getQueryParams()

    if (list === 'tabs') return lister.showHideCardsBasedOnFilters.tabs(source) // skip filterItemsInTabs(source)

    if (vState[list].filteredItems && vState[list].filteredItems.length > 0) {
      vState[list].filteredItems.forEach(item => {
        const cardDiv = dg.el('vitem_id_' + item._id)
        if (cardDiv) cardDiv.parentElement.remove()
      })
    }
    vState[list].filteredItems = []
    lister.resetDatesForList(list)
    // lister.endCard.showMore(vState)
    // resetOldestItems etc...
    // nb queryparams should be updated everytime there is a letter added to searchbox
  }
  const newShowTotal = vState.loadState.totalShown + SHOW_INCREMENTS

  const { newShownNum, unShownItemRemain } = lister.showHideCardsBasedOnFilters[list](newShowTotal, source)

  if (unShownItemRemain || newShownNum > vState.shownNum) {
    setTimeout(() => { lister.endCard.showMore() }, 300)
    // doNothing - more button should work
  } else if (vState.loadState.autoTries < MAX_AUTO_INCREMENTS) {
    vState.loadState.autoTries++
    const newItems = await lister.getMoreItems()
    // onsole.log('GETTING NEW ITEMS FROM SERVER vState.loadState.autoTries', vState.loadState.autoTries, { newShownNum, list, newItems })
    if (newItems.length === 0) {
      vState.loadState.gotAll = true
      lister.endCard.showNoMore()
    } else {
      lister.drawCardsOnMainDiv(list, newItems, mainDiv)
      // test
      setTimeout(async () => {
        await lister.filterItemsInMainDivOrGetMore('auto')
      }, 200)
    }

    // NB if (newShowTotal === vState.loadState.totalShown) {  Nothing new was shown as a result of the filter... should search more
  } else {
    // manual butt
    setTimeout(() => { lister.endCard.showMore() }, 500)
  }
  vState.loadState.totalShown = newShowTotal
  vState.shownNum = newShownNum
}

lister.fitsWordSearchCriteria = function (vSearchString, queryWords) {
  let fits = true
  if (!vSearchString) console.warn('no search words ')
  if (!vSearchString) vSearchString = ''
  if (!isNaN(vSearchString)) vSearchString = vSearchString + ''
  if (vSearchString?.length === 0 || !queryWords || !queryWords.trim()) return true

  queryWords = queryWords.split(' ')
  queryWords.forEach(queryWord => {
    queryWord = queryWord.toLowerCase().trim()
    if (!queryWord) {
      // do nothing
    } else if (queryWord.indexOf('!') === 0) {
      if (queryWord.length > 1 && vSearchString.indexOf(queryWord.slice(1)) > -1) fits = false
    } else {
      if (vSearchString.indexOf(queryWord) < 0) fits = false
    }
  })
  return fits
}
lister.showHideCardsBasedOnFilters = {
  hideAll: function () {
    lister.endCard.showLoading()
    const list = vState.queryParams.list
    if (vState[list] && list !== 'tabs') {
      const { unfilteredItems, filteredItems } = vState[list]
      const items = [...filteredItems, ...unfilteredItems]
      for (let i = items.length - 1; i >= 0; i--) {
        const cardDiv = dg.el(lister.idFromMark(items[i]))
        // const cardDiv = dg.el('vitem_id_' + items[i]._id)
        // const cardDiv = lister.idFromMark(items[i])
        if (cardDiv) lister.showHideCard(cardDiv, false, { list })
      }
    }
  },
  marks: function (newShowTotal, source) {
    let newShownNum = 0
    let unShownItemRemain = false

    const fitsCriteria = function (item, queryParams) {
      let fits = true

      // temp - all should have a vsearchstring
      if (item && !item.vSearchString) item.vSearchString = resetVulogKeyWords(item)

      fits = lister.fitsWordSearchCriteria(item?.vSearchString, queryParams.words)
      if (fits) {
        if (queryParams.starFilters && queryParams.starFilters.length > 0) {
          queryParams.starFilters.forEach(starFilter => {
            if (['inbox', 'star'].indexOf(starFilter) > -1) {
              if (!item.vStars || item.vStars.indexOf(starFilter) < 0) fits = false
            } else if (starFilter === 'vHighlights') {
              if (!item.vHighlights || item.vHighlights.length === 0) fits = false
            } else if (starFilter === 'vNote') {
              if (!item.vNote) fits = false
            }
          })
        }
      }
      return fits
    }

    const { unfilteredItems, filteredItems } = vState.marks
    const items = [...filteredItems, ...unfilteredItems]
    items.forEach(item => {
      const cardDiv = item._id ? dg.el('vitem_id_' + item._id) : (item.fj_local_temp_unique_id ? dg.el('vitem_temp_' + item.fj_local_temp_unique_id) : null)
      if (cardDiv) {
        const doesFit = fitsCriteria(item, vState.queryParams)
        const doShow = doesFit && (newShownNum < newShowTotal)
        if (doesFit && !doShow) unShownItemRemain = true
        if (doShow) newShownNum++
        const options = { list: 'marks' }
        lister.showHideCard(cardDiv, doShow, options)
      } else {
        console.warn('SNB - item not shown ', { item })
      }
    })
    return { newShownNum, unShownItemRemain }
  },
  messages: function (newShowTotal, source) { // currently this is cut and paste from markes - needs to be redone for messages
    let newShownNum = 0
    let unShownItemRemain = false

    const fitsCriteria = function (item, queryParams) {
      let fits = true
      fits = lister.fitsWordSearchCriteria(item?.vSearchString, queryParams.words)

      // to add people filters...
      return fits
    }

    const { unfilteredItems, filteredItems } = vState.messages
    const items = [...unfilteredItems, ...filteredItems]
    items.forEach(item => {
      const cardDiv = dg.el('vitem_id_' + item._id)
      if (cardDiv) {
        const doesFit = fitsCriteria(item, vState.queryParams)
        const doShow = doesFit && (newShownNum < newShowTotal)
        if (doesFit && !doShow) unShownItemRemain = true
        if (doShow) newShownNum++
        const options = { list: 'messages' }
        lister.showHideCard(cardDiv, doShow, options)
      } else {
        console.warn('SNB - item not shown ', { item })
      }
    })
    return { newShownNum, unShownItemRemain }
  },
  history: function (newShowTotal) {
    let newShownNum = 0

    const fitsCriteria = function (item, queryParams) {
      let fits = true
      // temp - all should have a vsearchstring
      if (item && !item.vSearchString) item.vSearchString = resetVulogKeyWords(item)
      fits = lister.fitsWordSearchCriteria(item?.vSearchString, queryParams.words)
      if (fits) {
        if (queryParams.date && (item.vCreated || item._date_created) > queryParams.date.getTime()) fits = false
      }
      return fits
    }

    // const isFiltered = (vState.queryParams.words || vState.queryParams.dateFilters)

    if (!vState.history) vState.history = lister.emptyStatsObj()

    const { unfilteredItems, filteredItems } = vState.history
    const items = [...filteredItems, ...unfilteredItems]
    // const items = unfilteredItems.concat(filteredItems)
    let counter = 0
    items.forEach(item => {
      const cardDiv = document.getElementById(lister.idFromMark(item)) // 'vitem_id_' + item._id) 
      if (cardDiv) {
        const doesFit = fitsCriteria(item, vState.queryParams)
        const doShow = doesFit // 2024-08 remvoed concept as new hostry view can't NOT show
        if (doShow) newShownNum++
        const options = { list: 'history' }
        if (!doShow) options.uncollpasePrevious = true  
        lister.showHideCard(cardDiv, doShow, options) // , { isFiltered, vCollapsible: item.vCollapsible })
      } else {
        // if (vState.tempUndrawnIds.indexOf(item._id) < 0)console.warn('SNB - item not shown ', { counter, item })
        console.warn('SNB - item not shown ' + lister.idFromMark(item), { counter, item })
      }
      counter++
    })
    return { newShownNum, unShownItemRemain: false }
  },
  tabs: function () {
    const fitsCriteria = function (item, queryParams) {
      let fits = true
      // temp - all should have a vsearchstring
      if (item && !item.vSearchString) item.vSearchString = resetVulogKeyWords(item)
      fits = lister.fitsWordSearchCriteria(item?.vSearchString, queryParams.words)
      // if (fits) { }
      return fits
    }

    const searchOldCards = !vState.queryParams.tabsOpenOnly
    const soundOnlyCards = vState.queryParams.tabsSoundOnly
    let typeCounter = 0
    vState.tabs.forEach(windowType => { // [openWindows, closedWindows]
      typeCounter++
      for (let [windowId, tabObjects] of Object.entries(windowType)) {
        for (let [tabId, tabObject] of Object.entries(tabObjects)) {
          tabObject.tabHistory.reverse().forEach((logItem, i) => {
            const cardDiv = dg.el(lister.idFromMark(logItem)) // 'vitem_id_' + item._id)
            if (cardDiv) {
              let doShow = true
              if (!searchOldCards && (!tabObject.open || i < tabObject.tabHistory.length - 1)) { // typeCounter > 1 ||
                doShow = false
              } else if (soundOnlyCards && !tabObject.tabDetails?.audible) {
                doShow = false
              } else {
                const doesFit = fitsCriteria(logItem, vState.queryParams)
                if (!doesFit) doShow = false
              }
              const options = { list: 'tabs' }
              if (!doShow && tabObject.tabHistory.length > 1 && i === tabObject.tabHistory.length - 1 ) options.uncollpasePrevious = true
              lister.showHideCard(cardDiv, doShow, options) // , { isFiltered, vCollapsible: item.vCollapsible })
              if (typeCounter === 1) { // close / mute button show hide
                setTimeout(() => {
                  const tabOuter = getParentWithClass(cardDiv, 'tabOuter')
                  tabOuter.firstChild.style.display = doShow ? 'block' : 'none'
                }, 300)
              }
            } else {
              // if (vState.tempUndrawnIds.indexOf(item._id) < 0)console.warn('SNB - item not shown ', { counter, item })
              console.warn('SNB - item not shown ', { logItem })
            }
          })
        }
      }
    })
  },
  publicmarks: function (newShowTotal, source) {
    let newShownNum = 0
    let unShownItemRemain = false

    const fitsCriteria = function (item, queryParams) {
      let fits = true
      // temp - all should have a vsearchstring
      if (item && !item.vSearchString) item.vSearchString = resetVulogKeyWords(item)

      fits = lister.fitsWordSearchCriteria(item?.vSearchString, queryParams.words)
      if (fits) {
        if (queryParams.starFilters && queryParams.starFilters.length > 0) {
          queryParams.starFilters.forEach(starFilter => {
            if (starFilter === 'vHighlights') {
              if (!item.vHighlights || item.vHighlights.length === 0) fits = false
            }
          })
        }
      }
      return fits
    }

    const { unfilteredItems, filteredItems } = vState.publicmarks
    const items = [...filteredItems, ...unfilteredItems]
    items.forEach(item => {
      const cardDiv = item._id ? dg.el('vitem_id_' + item._id) : (item.fj_local_temp_unique_id ? dg.el('vitem_temp_' + item.fj_local_temp_unique_id) : null)
      if (cardDiv) {
        const doesFit = fitsCriteria(item, vState.queryParams)
        const doShow = doesFit && (newShownNum < newShowTotal)
        if (doesFit && !doShow) unShownItemRemain = true
        if (doShow) newShownNum++
        const options = { list: 'publicmarks' }
        lister.showHideCard(cardDiv, doShow, options)
      } else {
        console.warn('SNB - item not shown ', { item })
      }
    })
    return { newShownNum, unShownItemRemain }
  }
}
lister.showHideCard = function (cardDiv, doShow, options) {
  // options: isFiltered vCollapsible
  // console.log('show hide ', { list: options?.list, doShow })
  const parent = cardDiv.parentElement
  if (vState.viewType === 'fullHeight') {
    parent.style.height = doShow ? '100%' : '0'
  } else {
    parent.style.width = doShow ? (lister.dims[options.list].width + 'px') : '0'
    parent.style.padding = (doShow && options?.list !== 'tabs') ? '10px' : '0'
  }
  // parent.style.margin = doShow ? '15px' : '0'

  if (options?.list === 'history' || options?.list === 'tabs' ) {
    if (options?.list === 'history') {
      if (doShow) {
        expandSection(parent, { height: lister.dims.history.height})
      } else {
        setTimeout(() => { collapseIfExpanded(parent) }, 100)
      }
    }
    const shouldCollpase = (parent.getAttribute('vCollapsible') && (options?.list !== 'tabs' || !(vState.queryParams.words)))
    // if (shouldCollpase && options?.list === 'tabs') parent.style.padding = '0'
    lister.setCardAsCollapsible(cardDiv, (doShow && shouldCollpase), options)
    if (!doShow) cardDiv.parentElement.style['margin-right'] = 0
    // if (!doShow && options?.uncollpasePrevious) { // uncollpase a card if the card in front of it has been filtered out
    //   const prevCardParent = parent.previousSibling
    //   if (prevCardParent && prevCardParent.getAttribute('vCollapsible') && prevCardParent.style.width !== '0px') lister.setCardAsCollapsible(prevCardParent.firstChild, false, options)
    // }
  }

  // orginal version
  // const shouldCollpase = (parent.getAttribute('vCollapsible')) 
  //   if (doShow && shouldCollpase) lister.setCardAsCollapsible(cardDiv, true, options)
  //   if (!doShow && options?.uncollpasePrevious) { // uncollpase a card if the card in front of it has been filtered out
  //     const prevCardParent = parent.previousSibling
  //     if (prevCardParent && prevCardParent.getAttribute('vCollapsible') && prevCardParent.style.width !== '0px') lister.setCardAsCollapsible(prevCardParent.firstChild, false, options)
  //   }
  // if (options.list === 'history') {
  //   if (doShow && shouldCollpase) lister.setCardAsCollapsible(cardDiv, true, options)
  //   if (!doShow) {
  //     cardDiv.style.margin = 0
  //     if (options?.uncollpasePrevious) { // uncollpase a card if the card in front of it has been filtered out
  //       let prevCardParent = parent.previousSibling
  //       while (prevCardParent && prevCardParent.style.width === '0px') prevCardParent = prevCardParent.previousSibling
  //       if (prevCardParent && prevCardParent.getAttribute('vCollapsible') && prevCardParent.style.width !== '0px') lister.setCardAsCollapsible(prevCardParent.firstChild, false, options)
  //     }
  //   }
  // }

  if (vState.viewType === 'fullHeight') {
    cardDiv.style.transform = doShow ? 'rotateX(0deg)' : 'rotateX(90deg)'
  } else {
    cardDiv.style.transform = doShow ? 'rotateY(0deg)' : 'rotateY(90deg)'
  }
  
}
lister.setCardAsCollapsible = function (cardDiv, doSet, options) {
  const parent = cardDiv.parentElement
  cardDiv.style.transition = 'all 1.0s ease-out'
  if (options?.list === 'history') cardDiv.style['background-color'] = doSet ? 'lightgrey' : 'white'

  parent.style['margin-right'] = doSet ? ('-' + ((lister.dims[options.list].widthForCollpasing || lister.dims[options.list].width) - 10) + 'px') : '15px'

  const extlink = cardDiv.querySelector('.fa-external-link')
  if (extlink) extlink.style.display = doSet ? 'none' : 'inline-block'
  const greyMessage = cardDiv.querySelector('.greyMessage')
  if (greyMessage) greyMessage.style.display = doSet ? 'block' : 'none'

  const collapsibleSides = ['.scrollAndTimeSpent', '.dateString', '.smallStarsOnCard', '.domainTitle', '.cardImageBox']
  collapsibleSides.forEach(hidableClass => {
    const hieableDiv = cardDiv.querySelector(hidableClass)
    if (hieableDiv) hieableDiv.style.display = doSet ? 'none' : ''
    // if (hieableDiv && hidableClass === '.domainTitle' && doSet) hieableDiv.style.display = 'inline-block'
    // if (hieableDiv) hieableDiv.style['margin-left'] = doSet ? '20px' : null
  })

  const titleDiv = cardDiv.querySelector('.vulog_title_url')
  titleDiv.style.transition = 'all 0.5s ease-out'
  titleDiv.style.width = doSet ? ((lister.dims[options.list].height - 30) + 'px') : null
  titleDiv.style.height = doSet ? '16px' : '30px'
  titleDiv.style.transform = doSet ? 'rotate(90deg)' : 'rotate(0deg)'
  titleDiv.style['transform-origin'] = 'left'
  titleDiv.style['margin-top'] = doSet ? '-5px' : '5px'
  titleDiv.style['margin-left'] = doSet ? '7px' : '0px'
  const showFullCard = function (e) {
    if (options?.list === 'tabs') drawBoxAroundTabCards(cardDiv)
    e.preventDefault()
    lister.setCardAsCollapsible(cardDiv, false, options)
  }
  cardDiv.onclick = doSet ? showFullCard : null
}
lister.getMoreItems = async function () {
  if (!vState.environmentSpecificGetOlderItems) {
    throw new Error('need to define environmentSpecificGetOlderItems to be able to get items')
  }

  const list = vState.queryParams.list
  // if (!vState[list]) vState[list] = lister.emptyStatsObj()

  if (list !== 'messages' && list !== 'tabs') {
    return await lister.getMoreAndUpdateCountStatsFor(list)
  } else if (list === 'tabs') {
    return await vState.getRecentTabData()
  } else { // messages is actually two lists that need to be merged
    return await lister.getAllMessagesAndMerge()
  }
}
lister.getAllMessagesAndMerge = async function () {
  // if (!vState.sentMsgs) vState.sentMsgs = lister.emptyStatsObj()
  // if (!vState.gotMsgs) vState.gotMsgs = lister.emptyStatsObj()
  const newSentMsgs = await lister.getMoreAndUpdateCountStatsFor('sentMsgs')
  const newGotMsgs = await lister.getMoreAndUpdateCountStatsFor('gotMsgs')
  const newItems = lister.mergeNewAndExistingMessages([], newSentMsgs, newGotMsgs) // note - really [] shoul;d be replaced by vState.messages.unfilteredItems - chec why old and new were seaprated befpore

  if (!vState.messages) vState.messages = lister.emptyStatsObj()
  if (!vState.messages.dates) vState.messages.dates = lister.emptyStatsObjDatesItem() // nb this should not happen but it does - ie potential bug in re-onitiating
  if (!vState.messages.unfilteredItems) vState.messages.unfilteredItems = []
  if (!vState.messages.filteredItems) vState.messages.filteredItems = []
  vState.messages.unfilteredItems = [...vState.messages.unfilteredItems, ...newItems]
  if (!vState.messages.dates) console.warn('messages.dates not initatlised')
  vState.messages.dates.oldestModified = [...vState.messages.unfilteredItems, ...vState.messages.filteredItems].reduce((acc, msg) => Math.min(msg._date_modified || new Date().getTime(), acc), vState.messages.dates.oldestModified)
  vState.messages.dates.newestModified = [...vState.messages.unfilteredItems, ...vState.messages.filteredItems].reduce((acc, msg) => Math.max(msg._date_modified || 0, acc), vState.messages.dates.newestModified)

  return newItems
}
const getAllMessagesAndUpdateStateteFor = async function (purl) {
  const retInfo = await vState.environmentSpecificSyncAndGetMessage(purl)
  if (!retInfo) return {}
  if (retInfo.error) return { error: retInfo.error }

  const mergedItems = retInfo.mergedMessages
  if (!mergedItems || mergedItems.length === 0) return { itemJson: {} }
  let itemJson = null

  mergedItems.forEach(item => {
    if (!item.record) {
      console.warn('no recrod to merge for ', item)
    } else if (!itemJson) {
      itemJson = convertDownloadedMessageToRecord(item)
    } else {
      itemJson = mergeMessageRecords(itemJson, item)
    }
  })

  const idx = vState.messages.unfilteredItems.findIndex((f) => f.purl === purl)
  if (idx < 0) {
    vState.messages.unfilteredItems.push(itemJson)
  } else {
    vState.messages.unfilteredItems[idx] = itemJson
  }
  vState.messages.unfilteredItems.sort(dateLatestMessageSorter)

  return { itemJson }
  // find purl in messages and update it
}
lister.mergeNewAndExistingMessages = function (existingitems, newSentOrGotMsgs1, newSentOrGotMsgs2) {
  if (!newSentOrGotMsgs1) newSentOrGotMsgs1 = []
  if (!newSentOrGotMsgs2) newSentOrGotMsgs2 = []
  const allNew = [...newSentOrGotMsgs1, ...newSentOrGotMsgs2]
  const itemJson = {}

  existingitems.forEach(item => {
    if (itemJson[item.record.purl]) console.warn('same putl appearing twice in merged messages???')
    itemJson[item.record.purl] = item
  })
  allNew.forEach(item => {
    if (!item.record) {
      console.warn('no recrod to merge for ', item)
    } else if (!itemJson[item.record.purl]) {
      itemJson[item.record.purl] = convertDownloadedMessageToRecord(item)
    } else {
      itemJson[item.record.purl] = mergeMessageRecords(itemJson[item.record.purl], item)
    }
  })
  const newItemsReturned = []
  for (const purl in itemJson) {
    itemJson[purl].vSearchString = resetVulogKeyWords(itemJson[purl])
    newItemsReturned.push(itemJson[purl])
  }
  newItemsReturned.sort(dateLatestMessageSorter)
  return newItemsReturned
}

lister.emptyStatsObj = function () {
  return {
    gotCount: 0,
    unfilteredItems: [],
    filteredItems: [],
    dates: lister.emptyStatsObjDatesItem(),
    lookups: {}
  }
}
lister.emptyStatsObjDatesItem = function () {
  return {
    oldestCreated: new Date().getTime(),
    newestModified: 0,
    oldestModified: new Date().getTime()
  }
}
lister.resetDatesForList = function (list) {
  const statsObject = vState[list]
  if (!statsObject.dates) statsObject.dates = lister.emptyStatsObjDatesItem()
  const mergedList = [...statsObject.unfilteredItems, ...statsObject.filteredItems]
  statsObject.dates.oldestModified = mergedList.reduce((acc, item) => Math.min((item?._date_modified || item?.fj_modified_locally || new Date().getTime()), acc), new Date().getTime())
  if (isNaN(statsObject.dates.oldestModified)) console.warn('Got a NaN for oldestModified', JSON.stringify(mergedList))
    statsObject.dates.newestModified = mergedList.reduce((acc, item) => Math.max((item?._date_modified || item?.fj_modified_locally || 0), acc), 0)
  if (isNaN(statsObject.dates.newestModified)) console.warn('Got a NaN for newestModified', JSON.stringify(mergedList))
  statsObject.dates.oldestCreated = mergedList.reduce((acc, item) => Math.min((item?.vCreated || item?._date_created || new Date().getTime()), acc), new Date().getTime())
  if (isNaN(statsObject.dates.oldestCreated)) console.warn('Got a NaN for oldestCreated', JSON.stringify(mergedList))
  }
lister.getMoreAndUpdateCountStatsFor = async function (list) {
  // onsole.log(' getMoreAndUpdateCountStatsFor')
  // this should only be used in getMoreItems or for marks, as it doesnt add the hasmarks key to the record

  if (!vState[list]) vState[list] = lister.emptyStatsObj()
  const statsObject = vState[list]

  // source oldest
  const SEARCHCOUNT = 100
  // let oldestModified = statsObject.dates.oldestModified
  // if (statsObject.filteredItems.length > 0) oldestModified = [... statsObject.unfilteredItems, ... statsObject.filteredItems].reduce((acc, item) => Math.min((item?._date_modified || item?.fj_modified_locally || new Date().getTime()), acc), statsObject.dates.oldestModified)
  
  // logic needs to be that this is reset when filtered items are..

  if (vState.loadState.gotAll) console.warn('SNBH - gotAll was marked so why fetched more?')
  if (vState.loadState.gotAll) return []

  const { newItems, typeReturned } = await vState.environmentSpecificGetOlderItems(list, { getCount: SEARCHCOUNT, dates: statsObject.dates, queryParams: lister.getQueryParams(), gotCount: statsObject.unfilteredItems.length, alreadyGotFIlteredItems: (statsObject.filteredItems.length > 0) }) // gotCount no longer needed??
  // onsole.log('getMoreAndUpdateCountStatsFor newItems', {newItems, typeReturned, dates: statsObject.dates })
  // environmentSpecificGetOlderItems judges whether to return unfiltered or filtered items -
  // ideally a number of unfiltered items are returned so graphics can be nade nice.. adn then the filtered items are retirned so asd to make search more efficient

  if (['history', 'marks', 'sentMsgs', 'gotMsgs', 'publicmarks'].indexOf(list) > -1) {
    statsObject.gotCount += (newItems?.length || 0)

    if (typeReturned === 'unfilteredItems' || typeReturned === 'filteredItems') {
      statsObject[typeReturned] = [...statsObject[typeReturned], ...newItems]
    } else {
      throw new Error('type need to be unfilteredItems or filteredItems - cirrently is ', typeReturned)
    }
    // if (!statsObject.oldestItem || isNaN(statsObject.oldestItem)) statsObject.oldestItem = new Date().getTime()
    if (!statsObject.dates) console.warn('stats obj dates hsant been initialised')
    if (!statsObject.dates) statsObject.dates = lister.emptyStatsObjDatesItem()
    statsObject.dates.oldestModified = newItems.reduce((acc, item) => Math.min((item?._date_modified || item?.fj_modified_locally || new Date().getTime()), acc), statsObject.dates.oldestModified)
    statsObject.dates.newestModified = newItems.reduce((acc, item) => Math.max((item?._date_modified || item?.fj_modified_locally || 0), acc), statsObject.dates.newestModified)
    statsObject.dates.oldestCreated = newItems.reduce((acc, item) => Math.min((item?.vCreated || item?._date_created || new Date().getTime()), acc), statsObject.dates.oldestCreated)

    if (list === 'history') {
      newItems.sort(sortBycreatedDate).reverse()
      // todo - cam merge adjacent ones with same
    } else if (list === 'messages') {
      newItems.sort(dateLatestMessageSorter)
    } else if (list === 'marks') {
      newItems.sort(sortBycreatedDate).reverse()
    } else if (list === 'publicmarks') {
      newItems.sort(sortByPublishedDate).reverse()
    }

    if (list === 'marks') {
      newItems.forEach(item => {
        if (!statsObject.lookups[item.purl]) statsObject.lookups[item.purl] = item
      })
    }
    return newItems
  } else if (list === 'tabs') { // tabs
    vState.loadState.gotAll = true
    const openTabs = {}
    const closedTabs = {}

    if (newItems?.currentTabs && newItems?.currentTabs.lemngth > 0) {
      newItems.currentTabs.forEach(openTab => {
        if (!openTabs[openTab.windowId]) openTabs[openTab.windowId] = {}
        if (newItems.logDetailsInRAM[openTab.id]) {
          openTabs[openTab.windowId][openTab.id] = newItems.logDetailsInRAM[openTab.id]
          // iterate through and remove duplicates
        } else {
          openTabs[openTab.windowId][openTab.id] = [openTab]
          // covnert to log type object purl, title, tabid, tabWindowId
        }
        delete newItems.logDetailsInRAM[openTab.id]
      })
      for (const [tabId, closedTab] of Object.entries(newItems.logDetailsInRAM)) {
        const tabWindowId = closedTab[0].tabWindowId || 'unknownWindow'
        if (!closedTabs[tabWindowId]) closedTabs[tabWindowId] = {}
        closedTabs[tabWindowId][tabId] = closedTab
      }
    } 

    statsObject.tabitems = { openTabs, closedTabs }
    return { openTabs, closedTabs }
  } else {
    console.error('SNBH')
  }
}
lister.drawFilters = function () {
  const filterDiv = vState.divs.searchFilters
  filterDiv.innerHTML = ''
  const queryParams = vState.queryParams
  const { list } = queryParams //  starFilters, dateFilters 
  const filterOuterParams = { style: { 'vertical-align': 'super', display: 'inline-block', 'margin-right': '5px', color: 'lightgrey' } }
  const filterInnerParams = {
    style: { 'background-color': 'white', 'border-radius': '3px', display: 'inline-block', color: 'darkgrey', height: '29px', 'margin-right': '5px' }
  }
  if (list === 'marks') {
    const STARS = ['star', 'inbox', 'vHighlights', 'vNote']
    filterDiv.appendChild(dg.div(filterOuterParams, 'Filters: '))
    const includeFilters = dg.div(filterInnerParams,
      dg.span({ style: { 'vertical-align': 'super' } }, ' ')) // Must have
    STARS.forEach(starName => { includeFilters.appendChild(lister.addFilterStar(starName)) })
    filterDiv.appendChild(includeFilters)
    // var excludeFilters = dg.span({ className: 'longcepsButt' }, 'Cannot have: ')
    // MAIN_STARS.forEach(starName => { excludeFilters.appendChild(lister.filterAdder(list, starName, 'exclude')) })
    // filterDiv.appendChild(excludeFilters)
  } else if (list === 'tabs') {
    filterDiv.appendChild(dg.span('Only show pages that ...  are open:', dg.input({
      type: 'checkbox',
      checked: vState.queryParams.tabsOpenOnly,
      style: { width: '20px', height: '20px', 'vertical-align': 'middle', 'margin-right': '30px' },
      onchange: async function (e) {
        vState.queryParams.tabsOpenOnly = e.target.checked
        lister.filterItemsInMainDivOrGetMore('searchChange')
        const titleDivs = document.querySelectorAll('[closedTabTitle=true]')
        titleDivs.forEach(titleDiv => {
          titleDiv.style.display = (vState.queryParams.tabsOpenOnly ? 'none' : 'block')
          titleDiv.nextSibling.style.display = 'none'
        })
        let windowDiv = document.querySelector('[closedWindowTitle=true]')
        windowDiv.style.display = (vState.queryParams.tabsOpenOnly ? 'none' : 'flex')
        while (windowDiv.nextSibling) {
          windowDiv.nextSibling.style.display = 'none'
          windowDiv = windowDiv.nextSibling
        }
      }
    })))
    filterDiv.appendChild(dg.span('have sound', dg.input({
      type: 'checkbox',
      checked: vState.queryParams.tabsSoundOnly,
      style: { width: '20px', height: '20px', 'vertical-align': 'middle', 'margin-left': '10px' },
      onchange: async function (e) {
        vState.queryParams.tabsSoundOnly = e.target.checked
        lister.filterItemsInMainDivOrGetMore('searchChange')
      }
    })))
  }
}
lister.addFilterStar = function (star) {
  const queryParams = vState.queryParams
  if (!queryParams.starFilters) queryParams.starFilters = []
  const existingFilters = queryParams.starFilters
  const chosen = (existingFilters.indexOf(star) > -1)
  return dg.span({
    className: ('vulog_overlay_' + star + '_' + (chosen ? 'ch' : 'nc')),
    style: { scale: 0.8 },
    onclick: async function (e) {
      const newChosen = !(e.target.className.slice(-2) === 'ch')
      if (newChosen) vState.queryParams.starFilters.push(star)
      if (!newChosen) vState.queryParams.starFilters.splice(queryParams.starFilters.indexOf(star), 1)
      e.target.className = ('vulog_overlay_' + star + '_' + (newChosen ? 'ch' : 'nc'))
      await lister.filterItemsInMainDivOrGetMore('searchChange')
    }
  })
}

// utilities
lister.getdomain = function (aUrl) {
  if (!aUrl) return 'Missing aUrl'
  const start = aUrl.indexOf('//') + 2
  const stop = aUrl.slice(start).indexOf('/')
  return aUrl.slice(0, stop + start)
}
lister.dragElement = function (elmnt) {
  // https://www.w3schools.com/howto/howto_js_draggable.asp
  let pos1 = 0
  let pos2 = 0
  let pos3 = 0
  let pos4 = 0

  if (document.getElementById(elmnt.id + 'header')) {
    // if present, the header is where you move the DIV from:
    document.getElementById(elmnt.id + 'header').onmousedown = dragMouseDown
    document.getElementById(elmnt.id + 'header').ontouchstart = dragTouchDown
  }
  // else {
  //   // otherwise, move the DIV from anywhere inside the DIV:
  //   elmnt.onmousedown = dragMouseDown;
  // }

  function dragMouseDown (e) {
    e = e || window.event
    e.preventDefault()
    // get the mouse cursor position at startup:
    pos3 = e.clientX
    pos4 = e.clientY
    elmnt.style['z-index'] = vState.zIndex++

    document.onmouseup = closeDragElement
    // call a function whenever the cursor moves:
    document.onmousemove = elementDrag
  }
  function dragTouchDown (e) {
    e.preventDefault()
    // get the mouse cursor position at startup:
    pos3 = e.clientX || e.touches[0].clientX
    pos4 = e.clientY || e.touches[0].clientY
    elmnt.style['z-index'] = vState.zIndex++
    document.ontouchend = closeTouchDragElement
    // call a function whenever the cursor moves:
    document.ontouchmove = elementDrag
  }

  function elementDrag (e) {
    // e = e || window.event;
    e.preventDefault()

    // if (!e.clientX) dg.el('click_gototab_messages').innerText = 'touches ' + JSON.stringify(e.touches)
    // if (!e.clientX) dg.el('click_gototab_history').innerText = 'targetTouches  ' + JSON.stringify(e.targetTouches)

    if (!e.clientX) e = e.changedTouches[0] // in case of a touch event
    // calculate the new cursor position:
    pos1 = pos3 - e.clientX
    const screenWidth = document.body.getClientRects()[0].width
    if (pos3 < 0) pos1 = 0
    if (pos3 > screenWidth) pos1 = 0
    pos2 = pos4 - e.clientY
    if (pos4 < 50) pos2 = 0
    pos3 = e.clientX
    pos4 = e.clientY
    // set the element's new position:
    // onsole.log(' element pos e.clientX', e.clientX, ' e.screenX', e.screenX)

    // elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
    // elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";

    let oldMoveX = parseInt(elmnt.getAttribute('data-moveX'))
    if (isNaN(oldMoveX)) dg.el('click_gototab_messages').innerText = 'isNaN  oldMoveX ' + oldMoveX + ' ' + pos1
    if (isNaN(oldMoveX)) oldMoveX = 0
    let oldMoveY = parseInt(elmnt.getAttribute('data-moveY'))
    if (isNaN(oldMoveY)) oldMoveY = 0
    const newMoveX = oldMoveX - pos1
    const newMoveY = oldMoveY - pos2
    // dg.el('click_gototab_sentMsgs').innerText = 'm ' + pos1 + ' y ' + pos3 + ' screen ' + e.screenX + ' newMoveX ' + newMoveX +  ' oldMoveX ' + oldMoveX + 'oldMoveY' + oldMoveY +  ' newMoveY ' + newMoveY + ' attrib ' + elmnt.getAttribute('data-moveY')

    elmnt.style.transform = 'translate(' + newMoveX + 'px , ' + newMoveY + 'px)'
    elmnt.setAttribute('data-moveX', newMoveX)
    elmnt.setAttribute('data-moveY', newMoveY)
  }

  function closeDragElement () {
    // stop moving when mouse button is released:
    document.onmouseup = null
    document.onmousemove = null
  }
  function closeTouchDragElement () {
    // stop moving when mouse button is released:
    document.ontouchup = null
    document.ontouchmove = null
  }
}
// time and scoll for logItems
const scrolledPercent = function (alog) {
  if (alog.vuLog_height && alog.vulog_max_scroll && !isNaN(alog.vuLog_height) && !isNaN(alog.vulog_max_scroll)) {
    return alog.vulog_max_scroll / alog.vuLog_height
  }
}
const percentString = function (fract) {
  if (!fract) return ''
  return Math.round(100 * fract) + '%'
}
const timeSpentOn = function (alog) {
  const visitDetails = alog.vulog_visit_details
  if (!visitDetails || visitDetails.length === 0) return null
  const reducerArray = [0, ...alog.vulog_visit_details]
  const timeSpent = reducerArray.reduce(function (total, obj) {
    const end = obj.end || obj.mid
    const newdiff = (end && !isNaN(end) && obj.start && !isNaN(obj.start)) ? (end - obj.start) : 0
    return total + newdiff
  })
  return timeSpent
}
const timePrettify = function (aTime) {
  if (!aTime) return ''
  return (Math.floor(aTime / 60000) > 0 ? (Math.floor(aTime / 60000) + 'mins ') : '') + (Math.round((aTime % 60000) / 1000, 0)) + 's'
}
const timeAndScrollString = function (alog) {
  const scrolled = percentString(scrolledPercent(alog))
  const time = timePrettify(timeSpentOn(alog))
  if (!scrolled && !time) return ' '
  return 'Viewed ' + (scrolled ? (scrolled + (time ? ', ' : '')) : ' ') + (time ? ('for ' + time) : '')
}

// uunused
document.addEventListener('click', e => {
  if (vState?.calendar && !getParentWithClass(e.target, 'calendar-popup') && !getParentWithClass(e.target, 'form-container')) { vState.calendar.hideCalendar() }
  // if (!getParentWithClass(e.target, 'calendar-popup') && !getParentWithClass(e.target, 'form-container')) { vState.calendar.hideCalendar()  }
})
