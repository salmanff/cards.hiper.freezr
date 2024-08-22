/*
    marks.js -> cards.hiper.freezr

    version 0.0.3 - mid 2023

*/
// todo:  revise and review
/* global dg */ // from dgelements.js
/* global freezr, freepr, freezrMeta */ // from freezr_core.js
/* global lister */ // from lister.js
/* global sortByModifedDate, appTableFromList, convertListerParamsToDbQuery */ // from utils.js
/* global smallSpinner */ // from drawUtils.js
/* global Calendar */ // from datepicker.js
// "initial_data": { "url": "/v1/pdbq/cards.hiper.freezr" }
const vState = {
  isLoggedIn: true,
  loadState: {
    tries: 0,
    totalShown: 0
  },
  viewType: 'fullHeight',
  zIndex: 1,
  queryParams: { list: 'publicmarks', isPublicView: true, words: null, starFilters: [], dateFilters: {} },
  queryPage: 0,
  querySkip: 0,
  markOnBackEnd: async function (mark, options, theStar, starWasChosen, addDefaultHashTag) {
    this.showWarning('no markOnBackEnd on public page')
  },
  mainNoteSaver: async function (mark) {
    this.showWarning('no mainNoteSaver on public page')
  },
  hLightCommentSaver: async function (hLight, text, options) { // options: purl, mark, noteSaver
    this.showWarning('no hLightCommentSaver on public page')
  },
  hLightDeleter: async function (hLight, mark) {
    this.showWarning('no hLightDeleter on public page')
  },
  // environmentSpecificGetMore: async function (list, count, skip, gotAll) {
  //   // for online web based version
  //   // todo diff filtered and unfiltered lists
  //   if (!gotAll) {
  //     const apptable = appTableFromList(list)
  //     const q = { fj_deleted: { $ne: true } }
  //     if (list === 'sentMsgs' || list === 'gotMsgs') q.app_id = 'cards.hiper.freezr'
  //     const newItems = await freepr.feps.postquery({
  //       app_table: apptable, q, count, skip
  //     })
  //     return newItems
  //   }
  //   return []
  // },
  environmentSpecificGetOlderItems: async function (list, params) {
    // for online web based version
    if (params.gotAll) return []

    if (list === 'history') list = 'logs'
    const gotCount = params?.gotCount


    // const oldestCreated = params?.dates?.oldestCreated
    let oldestModified = params?.dates?.oldestModified
    if (!oldestModified) {
      console.warn('no oldestModified sent -DNBH')
      oldestModified = new Date().getTime()
    }
    let q = { _date_modified: { $lt: oldestModified } }
    let typeReturned

    if (!gotCount || gotCount < 100) { // 200 is a random limit for not sending back unfiltered items
      typeReturned = 'unfilteredItems'
    } else {
      typeReturned = 'filteredItems'
      q = convertListerParamsToDbQuery(params.queryParams, q)
    }
    try {
      const data = { q, app_name: 'cards.hiper.freezr' }
      if (window.location.href.indexOf('/papp/@') > 0) {
        if (vState.queryParams.dataOwner !== 'public') {
          data.data_owner = vState.queryParams.dataOwner || vState.publicUser.slice(1)
        }
        if (vState.queryParams.feed) {
          data.feed = vState.queryParams.feed
          data.code = vState.queryParams.feedcode
        }
      }
      // onsole.log('data', data)
      const response = await fetch('/v1/pdbq', {
        method: 'POST',
        credentials: 'omit', // include, *same-origin, omit
        headers: {
          'Content-Type': 'application/json',
          // 'Content-Type': 'application/x-www-form-urlencoded',
        },
        referrerPolicy: 'no-referrer', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
        body: JSON.stringify(data)
      })
      const results = await response.json()
      const newItems = results.results
      // await freepr.feps.postquery({
      //   app_table: apptable, q, count: getCount, sort: { _date_modified: -1 }
      // })

      return { success: true, newItems, typeReturned }
    } catch (e) {
      console.warn(e)
      return { error: 'Could not get items ' + e.message }
    }
  },
  environmentSpecificGetMark: async function (purl) {
    const marksFromServer = await freepr.feps.postquery({
      app_table: 'cards.hiper.freezr.marks',
      q: { fj_deleted: { $ne: true }, purl }
    })
    const mark = (marksFromServer && marksFromServer.length > 0) ? marksFromServer[0] : null

    try {
      const q = { fj_deleted: { $ne: true }, app_id: 'cards.hiper.freezr', 'record.purl': purl }
      const gotMsgs = await freepr.feps.postquery({ app_table: appTableFromList('gotMsgs'), q })
      const sentMsgs = await freepr.feps.postquery({ app_table: appTableFromList('sentMsgs'), q })
      const messages = [...gotMsgs, ...sentMsgs]

      // todo - consider saving so same check doesnt need to be done multiple times
      return { messages, mark }
    } catch (e) {
      console.warn('Ignoring error getting messages', e)
      return { mark, messages: [] }
    }
  },
  asyncMarksAndUpdateVstate: async function () {
    const q = { fj_deleted: { $ne: true }, _date_modified: { $gt: vState.marks.newestItem } }
    const newItems = await freepr.feps.postquery({
      app_table: 'cards.hiper.freezr.marks', q
    })

    if (newItems && newItems.length > 0) {
      newItems.forEach(item => {
        let unfilteredItemIdx
        if (item._id) unfilteredItemIdx = vState.marks.unfilteredItems.findIndex(m => m._id === item._id)
        if (unfilteredItemIdx < 0) unfilteredItemIdx = vState.marks.unfilteredItems.find(m => m.fj_local_temp_unique_id === item.fj_local_temp_unique_id && m.purl === item.purl)
        if (unfilteredItemIdx > -1) {
          vState.marks.unfilteredItems[unfilteredItemIdx] = item
        } else {
          vState.marks.unfilteredItems.push(item)
        }
      })
      vState.marks.unfilteredItems.sort(sortByModifedDate).reverse()
    }
  },
  environmentSpecificSyncAndGetMessage: async function (purl) {
    const q = { fj_deleted: { $ne: true }, app_id: 'cards.hiper.freezr', 'record.purl': purl }
    let mergedMessages = null
    try {
      const recentSends = await freepr.feps.postquery({
        app_table: appTableFromList('sentMsgs'), q
      })
      const recentGots = await freepr.feps.postquery({
        app_table: appTableFromList('gotMsgs'), q
      })
      mergedMessages = [...recentSends, ...recentGots]
      return { mergedMessages }
    } catch (e) {
      console.warn({ e })
      return { error: e }
    }
  },
  environmentSpecificSendMessage: async function (params) {
    // params : { chosenFriends, text, hLight, markCopy }

    const { chosenFriends, text, hLight, markCopy } = params
    const successFullSends = []
    const erroredSends = []

    try {
      if (!chosenFriends || chosenFriends.length === 0) throw new Error('No friends chosen')
      if (!markCopy) throw new Error('mark copy could not be found', purl)
      markCopy.vComments = []
      const createRet = await freepr.ceps.create(markCopy, { app_table: 'cards.hiper.freezr.sharedmarks' })
      if (!createRet || createRet.error) throw new Error('Error creating shared mark: ' + (createRet?.error || 'unknown'))
      markCopy._id = createRet._id
    } catch (error) {
      console.warn('err in sending msg', error)
      return ({ error, successFullSends, erroredSends: chosenFriends })
    }

    const msgToSend = {
      messaging_permission: 'message_link',
      contact_permission: 'friends',
      table_id: 'cards.hiper.freezr.sharedmarks',
      record_id: markCopy._id,
      record: markCopy
    }

    // should do promises all here
    for (const idx in chosenFriends) {
      const friend = chosenFriends[idx]

      msgToSend.recipient_id = friend.username
      msgToSend.recipient_host = friend.serverurl
      msgToSend.record.vComments = [{
        recipient_host: friend.serverurl,
        recipient_id: friend.username,
        sender_host: vState.freezrMeta.serverAddress,
        sender_id: vState.freezrMeta.userId,
        vCreated: new Date().getTime(),
        text: hLight ? '' : text // if it is a highlight then the text goes in the highlights
      }]
      if (hLight) {
        hLight.vComments = [{
          recipient_host: friend.serverurl,
          recipient_id: friend.username,
          sender_host: vState.freezrMeta.serverAddress,
          sender_id: vState.freezrMeta.userId,
          vCreated: new Date().getTime(),
          text // if it is a highlight then the text goes in the highlights
        }]
        msgToSend.record.vHighlights = [hLight]
      }

      try {
        const sendRet = await freepr.ceps.sendMessage(msgToSend)
        if (!sendRet || sendRet.error) throw new Error('Error sending message: ' + (sendRet?.error || 'unknown'))
        successFullSends.push(friend)
      } catch (e) {
        console.error('error sending message', { e })
        const errJson = JSON.parse(JSON.stringify(friend))
        errJson.error = e.message
        erroredSends.push(errJson)
      }
    }

    return ({ successFullSends, erroredSends })
  },
  warningTimeOut: null,
  showWarning: function (msg, timing) {
    console.warn('WARNING : ' + JSON.stringify(msg))
    // null msg clears the message
    if (vState.warningTimeOut) clearTimeout(vState.warningTimeOut)
    if (!msg) {
      dg.el('warning_outer').style.display = 'none'
      dg.el('warnings', { clear: true })
    } else {
      const newWarning = dg.div(
        { style: { border: '1px solid grey', 'border-radius': '3px', padding: '3px', margin: '3px' } })
      newWarning.innerHTML = msg
      dg.el('warnings').appendChild(newWarning)
      dg.el('warning_outer').style.display = 'block'
      dg.el('warning_outer').style['z-index'] = '9999'
      if (timing) {
        setTimeout(function () {
          newWarning.remove()
          if (dg.el('warnings').innerText === '') dg.el('warning_outer').style.display = 'none'
        }, timing)
      }
    }
  }
}

freezr.initPageScripts = function () {
  setTimeout(initState, 0)
}

const initState = async function () {
  vState.divs = {}
  vState.divs.main = dg.el('vulogRecords')
  vState.divs.spinner = dg.el('spinner')
  vState.divs.spinner.appendChild(dg.div({ style: { 'text-align': 'center' } }, smallSpinner({ width: '50px' })))

  vState.divs.searchBox = dg.el('idSearchMarksBox')
  vState.divs.searchButton = dg.el('click_search_marks')
  vState.divs.searchFilters = dg.el('click_search_filters')
  vState.divs.dateFilter = dg.el('dateInput')
  vState.calendar = new Calendar('#dateInput')
  vState.calendar.onChooseDate = async function (e) {
    await lister.filterItemsInMainDiv(vState, 'searchChange')
  }

  vState.freezrMeta = freezrMeta || {}

  vState.publicUser = window.location.pathname.slice((window.location.pathname.indexOf('/papp/') + '/papp/'.length), window.location.pathname.indexOf('/cards.hiper.freezr') )

  vState.queryParams = lister.getUrlParams()
  // list, words, starFilters, notStarfilters, startDate, endDate
  if (vState.queryParams.words) vState.divs.searchBox.innerText = vState.queryParams.words
  const dataOwner = vState.queryParams.dataOwner || vState.publicUser.slice(1)

  dg.el('top_logo').onerror = function () {
    // onsole.log('didnt get image ' + '/publicfiles/@' + vState.publicUser + '/info.freezr.account/profilePict.jpg')
    // dg.el('top_logo').src = '/app_files/' + vState.publicUser + '/cards.hiper.freezr/public/static/logo.png'
    // dg.el('top_logo').onerror = null
  }
  dg.el('top_logo').src = dataOwner === 'public' ? '/app_files/' + vState.publicUser + '/cards.hiper.freezr/public/static/logo.png' : '/publicfiles/@' + dataOwner + '/info.freezr.account/profilePict.jpg'
  http://localhost:3000/app_files/@public/cards.hiper.freezr/public/static/logo.png
  dg.el('top_logo').style['border-radius'] = '25px'
  dg.el('top_logo').nextElementSibling.innerText = vState.queryParams.feed || ((dataOwner !== 'public' ? (dataOwner + "'s ") : 'public ') + "hiper.cards posts")

  try {
    vState.friends = vState.freezrMeta?.perms?.friends?.granted ? await freepr.feps.postquery({ app_table: 'dev.ceps.contacts', permission_name: 'friends' }) : []
    vState.groups = vState.freezrMeta?.perms?.groups?.granted ? await freepr.feps.postquery({ app_table: 'dev.ceps.groups', permission_name: 'groups' }) : []
    if (vState.freezrMeta?.perms?.privateCodes?.granted) {
      const accessRet = await freepr.perms.validateDataOwner(
        {
          data_owner_user: 'public',
          table_id: 'dev.ceps.privatefeeds.codes',
          permission: 'privateCodes'
        })
      // options - data_owner_user table_id permission
      vState.feedcodes = await freepr.feps.postquery({
        // app_table: 'dev.ceps.privatefeeds.codes',
        appToken: accessRet['access-token'],
        requestor_user: vState.freezrMeta?.userId,
        permission_name: 'privateCodes',
        data_owner_user: 'public',
        app_table: 'dev.ceps.privatefeeds.codes',
        permission: 'privateCodes',
        app_id: 'cards.hiper.freezr'
      })
    }
  } catch (e) {
    console.error(e)
  }

  lister.setDivListeners(vState)

  // const lists = ['messages', 'history', 'marks']
  // lists.forEach(list => { dg.el('click_gototab_' + list).onclick = clickers })


  vState.queryParams.list = 'publicmarks'
  // TODO Add all other filters here
  resetHeaders()

  // onsole.log({ vState })

  document.body.style['overflow-x'] = 'hidden'

  await setUpDivsAndDrawItems()
}

// const clickers = async function (evt) {
//   const parts = evt.target.id.split('_')
//   const list = vState.queryParams.list
//   if (parts[1] === 'gototab') {
//     if (list === parts[2]) return

//     vState.divs.spinner.style.display = 'block'
//     lister.showHideCardsBasedOnFilters.hideAll(vState)
//     vState.queryParams.list = parts[2]
//     resetHeaders()
//     setTimeout(async () => {
//       await setUpDivsAndDrawItems()
//     }, 500)
//   }
// }

const resetHeaders = function () {
  vState.divs.spinner.style.display = 'block'
  const list = vState.queryParams.list
  dg.el('viewInTabWindow').style['background-color'] = 'rgba(121, 240, 186, 0.59)' // 'rgb(121 240 186 / 59%)'
  // if (document.querySelector('.tmChosen')) document.querySelector('.tmChosen').className = 'tmClosed'
  // if (document.getElementById('click_gototab_' + list)) document.getElementById('click_gototab_' + list).className = 'tmChosen'
  const statePrePath = (window.location.pathname.indexOf('index.html') < 0) ? 'cards.hiper.freezr/' : ''
  // window.history.pushState(null, '', statePrePath + 'index.html?view=' + list) // need to add feed and dataowner
}

const setUpDivsAndDrawItems = async function () {
  dg.el('dateFormOuter').style.display = 'none'
  dg.el('click_search_filters').style.display = 'block'
  await lister.drawAllItemsForList()
}
