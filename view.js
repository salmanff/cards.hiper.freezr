/*
    marks.js -> cards.hiper.freezr

    version 0.0.3 - mid 2023

*/
// todo:  revise and review
/* global dg */ // from dgelements.js
/* global freezr, freepr, freezrMeta */ // from freezr_core.js
/* global lister */ // from lister.js
/* global MCSS */ // from lister.js
/* global sortByModifedDate, sortBycreatedDate, convertLogToMark, appTableFromList, resetVulogKeyWords, convertListerParamsToDbQuery */ // from utils.js
/* global smallSpinner */ // from drawUtils.js
/* global Calendar */ // from datepicker.js

const vState = {
  isLoggedIn: true,
  loadState: {
    tries: 0,
    totalShown: 0
  },
  zIndex: 1,
  queryParams: { list: null, words: null, starFilters: [], dateFilters: {} },
  queryPage: 0,
  querySkip: 0,
  markOnBackEnd: async function (mark, options, theStar, starWasChosen, addDefaultHashTag) {
    const isNewMark = (!mark)
    if (isNewMark && options.logToConvert) {
      mark = convertLogToMark(options.logToConvert)
    }
    if (!mark.vStars) mark.vStars = []
    if (mark && ['inbox', 'star', 'bookmark'].indexOf(theStar) > -1 && ((starWasChosen && mark.vStars.indexOf(theStar) > -1) || ((!starWasChosen && mark.vStars.indexOf(theStar) < 0)))) { // doAdd or remove
      if (!starWasChosen) {
        if (theStar !== 'bookmark') mark.vStars.push(theStar)
      } else {
        mark.vStars.splice(mark.vStars.indexOf(theStar), 1)
      }
      let result
      if (!isNewMark) {
        const markPartsCopy = {
          _id: mark._id,
          vStars: mark.vStars
        }
        result = await freepr.feps.update(markPartsCopy, { app_table: 'cards.hiper.freezr.marks', replaceAllFields: false })
      } else { // isNewMark
        result = await freepr.feps.create(mark, { app_table: 'cards.hiper.freezr.marks' })
      }
      if (result && !result.success && !result.error) {
        result.success = true
        await vState.asyncMarksAndUpdateVstate()
      }
      return result
    } else if (theStar === 'trash') {
      const KEYSTOSTAY = ['_date_modified', '_date_created', '_id', '_owner', '_accessible_By', 'fj_modified_locally', 'fj_local_temp_unique_id']
      const markPartsCopy = {}
      KEYSTOSTAY.forEach((key) => { markPartsCopy[key] = mark[key] })
      markPartsCopy.fj_deleted = true
      const result = await freepr.feps.update(markPartsCopy, { app_table: 'cards.hiper.freezr.marks', replaceAllFields: true })
      if (result && !result.success && !result.error) result.success = true
      if (result.success) {
        const cardDiv = document.getElementById('vitem_id_' + mark._id)
        lister.showHideCard(cardDiv, false)
        setTimeout(function () { cardDiv.parentElement.style.display = 'none' }, 1000)
      }
      return result
    } else {
      console.warn({ mark, options, theStar, starWasChosen, addDefaultHashTag })
      console.error('wrong parameters')
    }
  },
  mainNoteSaver: async function (mark) {
    vState.saver.saveList.vNotes[mark._id] = mark.vNote
    return vState.saveWithInterValer()
  },
  hLightCommentSaver: async function (hLight, text, options) { // options: purl, mark, noteSaver
    if (!hLight || !text || (!options.purl && !options.mark)) return { error: true, msg: 'need comment text to process' }

    const mark = options.mark
    const vCreated = new Date().getTime()
    const theComment = { text, vCreated, sender_id: freezrMeta?.userId, sender_host: freezrMeta?.serverAddress }

    let foundHlight = false
    for (let i = 0; i < mark.vHighlights.length; i++) {
      if (hLight.id === mark.vHighlights[i].id) {
        foundHlight = true
        if (!hLight.vComments) hLight.vComments = []
        hLight.vComments.push(theComment)
        mark.vHighlights[i] = hLight
      }
    }
    if (!foundHlight) return { error: true, msg: 'no hlight found' }

    const toChange = { _id: mark._id, vHighlights: mark.vHighlights, vSearchString: resetVulogKeyWords(mark) }
    const result = await freepr.feps.update(toChange, { app_table: 'cards.hiper.freezr.marks', replaceAllFields: false })
    await vState.asyncMarksAndUpdateVstate()
    if (!result || result.error) {
      return { success: false, error: result?.error }
    }
    return { success: true }
  },
  hLightDeleter: async function (hLight, mark) {
    console.warn('hlightdeleter not implemented for online version')
    return { error: true, msg: 'hlightdeleter not implemented for online version' }
  },
  saveWithInterValer: async function () {
    const now = new Date().getTime()
    if (!vState.saver.firstTimeSinceSave) vState.saver.firstTimeSinceSave = now
    clearTimeout(vState.saver.intervaler)
    if (now - vState.saver.firstTimeSinceSave > vState.saver.THRESHOLD_FOR_FORCED_SAVE) {
      vState.saver.intervaler = null // - needed??
      return await vState.saver.saveItems()
    } else {
      clearTimeout(vState.saver.intervaler)
      vState.saver.intervaler = setTimeout(vState.saver.saveItems, vState.saver.INTERVALS)
      return { success: true, note: 'set time out to save' }
    }
  },
  saver: {
    intervaler: null,
    saveList: { vNotes: {}, hLights: {} },
    firstTimeSinceSave: null,
    THRESHOLD_FOR_FORCED_SAVE: 5000, // 5 seconds before forceSave
    INTERVALS: 2000, // 2seconds
    saveItems: async function () {
      vState.saver.firstTimeSinceSave = null
      const errors = []
      for (const [_id, vNote] of Object.entries(vState.saver.saveList.vNotes)) {
        const markOnVstate = vState.marks.unfilteredItems.find(m => m._id === _id) || vState.marks.filteredItems.find(m => m._id === _id)
        if (!markOnVstate) {
          errors.push({ _id, result: { error: 'no mark found' } })
        } else {
          const vSearchString = resetVulogKeyWords(markOnVstate)
          const markPartsCopy = { _id, vNote, vSearchString }
          const result = await freepr.feps.update(markPartsCopy, { app_table: 'cards.hiper.freezr.marks', replaceAllFields: false })
          if (!result || result.error) errors.push({ _id, result })
        }
      }
      if (errors.length === 0) {
        await vState.asyncMarksAndUpdateVstate()
        return { success: true }
      }
      if (errors.length > 0) console.error(' got errors in uploading savers ', { errors })
      return { success: false, errors: {} }
    }
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
    const apptable = appTableFromList(list)
    const getCount = params?.getCount || 100
    const gotCount = params?.gotCount
    // const oldestCreated = params?.dates?.oldestCreated
    let oldestModified = params?.dates?.oldestModified
    if (!oldestModified) {
      console.warn('no oldestModified sent -DNBH')
      oldestModified = new Date().getTime()
    }
    // onsole.log('environmentSpecificGetOlderItems -  ', { oldestModified: new Date(oldestModified) })

    let q = { _date_modified: { $lt: oldestModified }, fj_deleted: { $ne: true } }
    if (list === 'sentMsgs' || list === 'gotMsgs') q.app_id = 'cards.hiper.freezr'

    let typeReturned

    if (!gotCount || gotCount < 100) { // 200 is a random limit for not sending back unfiltered items
      typeReturned = 'unfilteredItems'
    } else {
      typeReturned = 'filteredItems'
      q = convertListerParamsToDbQuery(params.queryParams, q)
    }
    try {
      const newItems = await freepr.feps.postquery({
        app_table: apptable, q, count: getCount
      })

      newItems.sort(sortBycreatedDate).reverse()
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
      const q = { fj_deleted: { $ne: true }, app_id: 'cards.hyper.freezr', 'record.purl': purl }
      const sentMsgs = await freepr.feps.postquery({ app_table: appTableFromList('sentMsgs'), q })
      const gotMsgs = await freepr.feps.postquery({ app_table: appTableFromList('gotMsgs'), q })
      const messages = [...gotMsgs, ...sentMsgs]

      // todo - consider saving so same check doesnt need to be done multiple times
      return { messages, mark }
    } catch (e) {
      console.warn('ignoring error getting message ', { purl, e })
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
    await lister.filterItemsInMainDivOrGetMore('searchChange')
  }

  vState.freezrMeta = freezrMeta || {}
  vState.freezrMeta.perms = {}
  const permsList = await freepr.perms.getAppPermissions()
  permsList.forEach(perm => {
    vState.freezrMeta.perms[perm.name] = perm
  })

  try {
    vState.friends = vState.freezrMeta?.perms?.friends?.granted ? await freepr.feps.postquery({ app_table: 'dev.ceps.contacts', permission_name: 'friends' }) : []
    vState.groups = vState.freezrMeta?.perms?.groups?.granted ? await freepr.feps.postquery({ app_table: 'dev.ceps.groups', permission_name: 'groups' }) : []
  } catch (e) {
    console.error('error in getting contacts at initstate', e)
  }

  lister.setDivListeners()

  const lists = ['messages', 'history', 'marks']
  lists.forEach(list => { dg.el('click_gototab_' + list).onclick = clickers })

  vState.queryParams = lister.getUrlParams()
  // list, words, starFilters, notStarfilters, startDate, endDate
  if (vState.queryParams.words) vState.divs.searchBox.innerText = vState.queryParams.words
  // TODO Add all other filters here
  resetHeaders()

  // onsole.log({ vState })

  document.body.style['overflow-x'] = 'hidden'

  await setUpDivsAndDrawItems()
  try {
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
    console.error('error in getting feedcodes at initstate', e)
  }
}

const clickers = async function (evt) {
  const parts = evt.target.id.split('_')
  const list = vState.queryParams.list
  if (parts[1] === 'gototab') {
    if (list === parts[2]) return

    vState.divs.spinner.style.display = 'block'
    lister.showHideCardsBasedOnFilters.hideAll()
    vState.queryParams.list = parts[2]
    resetHeaders()
    setTimeout(async () => {
      await setUpDivsAndDrawItems()
    }, 500)
  }
}

const resetHeaders = function () {
  vState.divs.spinner.style.display = 'block'
  const list = vState.queryParams.list
  dg.el('viewInTabWindow').style['background-color'] = (list === 'messages' ? MCSS.PURPLE : (list === 'history' ? MCSS.YGREENBG : MCSS.GREEN))
  document.querySelector('.tmChosen').className = 'tmClosed'
  if (document.getElementById('click_gototab_' + list)) document.getElementById('click_gototab_' + list).className = 'tmChosen'
  window.history.pushState(null, '', 'index.html?view=' + list)
}

const setUpDivsAndDrawItems = async function () {
  dg.el('dateFormOuter').style.display = (vState.queryParams.list === 'history') ? 'block' : 'none'
  dg.el('click_search_filters').style.display = (vState.queryParams.list === 'history') ? 'none' : 'block'
  await lister.drawAllItemsForList()
}
