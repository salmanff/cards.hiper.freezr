// pageData.js - part of vulog
// changed 2022-04
// Compare iosApp vs ChromeExtension - verified 2022-07-05
 
/* exported VuPageData */
/* global pureUrlify, resetVulogKeyWords, domainAppFromUrl, startsWith, endsWith, hostFromUrl, vulogIsFromIos */

function VuPageData (options) {
  const isFromIos = (typeof vulogIsFromIos !== 'undefined' && vulogIsFromIos === true)
  const defaultOptions = { ignoreNonStandard: true, ignoreCookies: false, isFromIos }
  const finalOptions = Object.assign({}, defaultOptions, (options || {}))
  this.props = getAllPageTags(finalOptions)
}

const getAllPageTags = function (options) {
  // initiates parsedTags and gets all meta data assuming there is a document in window
  let parsedTags = {
    url: window.location.href,
    isiframe: (window.self !== window.top),
    purl: pureUrlify(window.location.href),
    hasBody: haveBody(),
    referrer: document.referrer,
    vCreated: new Date().getTime()
  }
  const docTitle = getDocumentTitle()
  if (docTitle) parsedTags.title = docTitle

  if (haveBody()) {
    const allMetas = document.getElementsByTagName('meta')
    parsedTags = addMetaTotags(parsedTags, allMetas, options)
    parsedTags.vuLog_height = document.getElementsByTagName('BODY')[0].scrollHeight
  }
  parsedTags = applyXTitleAndImageFallbacksForIos(parsedTags, options)

  if (!options.ignoreCookies) {
    try {
      parsedTags.vulog_cookies = getCookies()
    } catch (e) {
      console.warn('Error getting cookie from ' + window.location.href + ' \n ' + JSON.stringify(e))
      parsedTags.vulog_hidden_cees = true
    }

    const [vulog3pjs, vulog3pimg] = get3rdPartyLinks()
    parsedTags.vulog_3rdParties = { js: vulog3pjs, img: vulog3pimg }
  }

  return parsedTags
}
const getDocumentTitle = function () {
  if (document.getElementsByTagName('title') && document.getElementsByTagName('title')[0]) {
    return document.getElementsByTagName('title')[0].innerText
  }
  return ''
}
const normalizeTitle = function (title) {
  return (title || '').trim()
}
const isLowQualityTitle = function (title) {
  const normalized = normalizeTitle(title)
  if (normalized.length <= 10 || normalized.toLowerCase() === 'x') return true
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) return true
  return false
}
const hostFromWindowLocation = function () {
  try {
    return new URL(window.location.href).host.toLowerCase()
  } catch (e) {
    return ''
  }
}
const isXHost = function () {
  const host = hostFromWindowLocation()
  return (host === 'x.com' || host.endsWith('.x.com') || 
      host === 'twitter.com' || host.endsWith('.twitter.com') || 
      host === 'instagram.com' || host.endsWith('.instagram.com'))
}
const isXStatusUrl = function () {
  if (!isXHost()) return false
  return /\/[^/]+\/status\/\d+/.test(window.location.pathname || '')
}
const getMetaContent = function (key) {
  const byName = document.querySelector('meta[name="' + key + '"]')
  if (byName && byName.content) return byName.content
  const byProperty = document.querySelector('meta[property="' + key + '"]')
  if (byProperty && byProperty.content) return byProperty.content
  return ''
}
const getTweetTextFallback = function () {
  const tweetTextContainer = document.querySelector('[data-testid="tweetText"]')
  if (tweetTextContainer && tweetTextContainer.textContent) {
    return tweetTextContainer.textContent.trim()
  }
  return ''
}
const normalizeXProfileImageUrl = function (imageUrl) {
  if (!imageUrl) return ''
  return imageUrl
    .replace('_normal.', '_400x400.')
    .replace('_bigger.', '_400x400.')
}
const getXProfileImageFallback = function () {
  let statusUser = ''
  if (isXStatusUrl()) {
    const pathParts = (window.location.pathname || '').split('/').filter(Boolean)
    statusUser = pathParts[0] || ''
  }
  if (statusUser) {
    const articles = document.querySelectorAll('article')
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i]
      const authorLink = article.querySelector('a[href="/' + statusUser + '"]')
      const avatarImg = article.querySelector('[data-testid="Tweet-User-Avatar"] img[src*="pbs.twimg.com/profile_images/"]')
      if (authorLink && avatarImg && avatarImg.src) {
        return normalizeXProfileImageUrl(avatarImg.src)
      }
    }
  }
  const selectors = [
    'article [data-testid="Tweet-User-Avatar"] img[src*="pbs.twimg.com/profile_images/"]',
    'div[data-testid="Tweet-User-Avatar"] img[src*="pbs.twimg.com/profile_images/"]',
    'img[src*="pbs.twimg.com/profile_images/"]'
  ]
  for (let i = 0; i < selectors.length; i++) {
    const img = document.querySelector(selectors[i])
    if (img && img.src) return normalizeXProfileImageUrl(img.src)
  }
  return ''
}
const chooseBestTitle = function (titleCandidates) {
  for (let i = 0; i < titleCandidates.length; i++) {
    const candidate = normalizeTitle(titleCandidates[i])
    if (candidate && !isLowQualityTitle(candidate)) return candidate
  }
  for (let i = 0; i < titleCandidates.length; i++) {
    const candidate = normalizeTitle(titleCandidates[i])
    if (candidate) return candidate
  }
  return ''
}
const applyXTitleAndImageFallbacksForIos = function (parsedTags, options) {
  if (!options || !options.isFromIos) return parsedTags
  if (!isXHost()) return parsedTags

  const docTitle = getDocumentTitle()
  const ogTitle = getMetaContent('og:title')
  const twitterTitle = getMetaContent('twitter:title')
  const tweetText = isXStatusUrl() ? getTweetTextFallback() : ''
  const currentTitle = parsedTags.title || ''
  const chosenTitle = chooseBestTitle([currentTitle, ogTitle, twitterTitle, tweetText])
  const currentImage = parsedTags.image || ''
  const avatarImage = isXStatusUrl() ? getXProfileImageFallback() : ''
  const chosenImage = (!currentImage || !currentImage.includes('profile_images/')) ? avatarImage : currentImage
  if (chosenTitle) parsedTags.title = chosenTitle
  if (chosenImage) parsedTags.image = chosenImage
  return parsedTags
}
const EQUIV_NAMES = {
  type: 'type', // 'article', 'website' keep 1
  'og:type': 'type',

  description: 'description',
  'twitter:description': 'description', // keep 1
  Description: 'description',
  'og:description': 'description',
  'sailthru.description': 'description',

  title: 'title', // keep 1
  'twitter:title': 'title',
  'sailthru.title': 'title',
  'og:title': 'title',

  author: 'author', // keep 1
  'og:article:author': 'author',
  'article:author': 'author',
  'vr:author': 'author',
  'sailthru.author': 'author',

  keywords: 'keywords', // add all
  news_keywords: 'keywords',
  'sailthru.tags': 'keywords',
  'og:article:tag': 'keywords',

  image: 'image',
  'twitter:image:src': 'image',
  'twitter:image': 'image',
  'og:image': 'image',
  'sailthru.image.full': 'image',

  'og:site_name': 'domainApp', // Any one of these (pref: application-name) and if not the domain
  'al:android:app_name': 'domainApp',
  'al:ios:app_name': 'domainApp',
  'application-name': 'domainApp',

  'article:published_time': 'published',
  'article:published': 'published',

  'article:modified': 'modified',
  'article:modified_time': 'modified'
}
const NON_STD_NAMES = [ // These are recorded
  'sailthru.date', 'date',
  'twitter:app:country', 'og:locale', 'outbrain:sourcename',
  'generator', 'Generator', 'twitter:creator', 'article:publisher',
  'sailthru.verticals', 'tbi-vertical', 'article:collection',
  'ptime', 'DISPLAYDATE', 'pdate', 'utime',
  'article:section', 'article:top-level-section',
  'thumbnail_150', 'thumbnail_150_height', 'thumbnail_150_width', 'thumbnail', 'thumbnail_height', 'thumbnail_width'
]
const IGNORE_NAMES = [
  'viewport', 'referrer', 'theme-color', 'fb:app_id',
  'apple-itunes-app', 'apple-mobile-web-app-title',
  'al:ios:app_store_id', 'al:android:package', 'al:ios:url', 'al:android:url', 'al:web:url',
  'twitter:site', 'twitter:url', 'twitter:card',
  'fb:admins', 'fb:page_id',
  'twitter:domain', 'og:url', 'twitter:app:name:iphone', 'twitter:app:id:iphone', 'twitter:app:url:iphone',
  'twitter:app:name:ipad', 'twitter:app:id:ipad', 'twitter:app:url:ipad', 'twitter:app:name:googleplay',
  'twitter:app:url:googleplay', 'twitter:app:id:googleplay',
  'google-site-verification', 'p:domain_verify', 'og:image:width', 'og:image:height',
  'msapplication-window', 'msapplication-tooltip', 'msapplication-task',
  'MobileOptimized', 'HandheldFriendly', 'keywofb:pages', 'msapplication-TileColor', 'msapplication-TileImage',
  'msapplication-square70x70logo', 'msapplication-square150x150logo', 'msapplication-wide310x150logo', 'msapplication-square310x310logo',
  'p:domain_verify', 'msvalidate pocket-site-verifcation', 'parsely-page',
  'sailthru.image.thumb', 'linkedin:owner',
  'sourceApp', 'applicationName', 'al:iphone:url', 'al:iphone:app_store_id', 'al:iphone:app_name', 'al:ipad:url',
  'al:ipad:app_store_id', 'al:ipad:app_name', 'robots', 'hdl_p', 'genre', 'articleid', 'usageTerms', 'hdl',
  'article:section-taxonomy-id', 'article:section_url', 'dat', 'lp', 'msapplication-starturl', 'cre', 'slug', 'sectionfront_jsonp', 'tone', 'byl', 'PT', 'CG', 'SCG', 'PST', 'tom',
  'edt', 'twitter:image:alt', 'article:tag', 'des', 'nyt-collection:display-name', 'nyt-collection:identifier',
  'nyt-collection:url', 'nyt-collection:uri', 'nyt-collection:tone', 'nyt-collection:type', 'CN', 'CT', 'dfp-ad-unit-path', 'dfp-amazon-enabled'
]
const addMetaTotags = function (parsedTags, allMetas, options = { ignoreNonStandard: true }) {
  // assumes title url purl ... have already been added to ParsedTags and adds other meta objects
  const EMPTY_STR = ['type', 'author', 'description', 'published', 'modified', 'domainApp']
  EMPTY_STR.forEach(tag => { parsedTags[tag] = '' })
  const EMPTY_ARRS = ['keywords', 'temp_unknown_tags', 'vulog_visit_details']
  EMPTY_ARRS.forEach(tag => { parsedTags[tag] = [] })
  parsedTags.other = {}

  // console 2020 todo review all tags

  // get all meta data
  let mName
  if (allMetas && allMetas.length > 0) {
    for (let i = 0; i < allMetas.length; i++) {
      const m = allMetas[i]
      mName = m.getAttribute('name')
      if (!mName) mName = m.getAttribute('property')
      if (mName && m.getAttribute('content')) {
        // onsole.log('got meta '+mName+': '+m.getAttribute('content'))
        if (EQUIV_NAMES[mName]) {
          if (mName.indexOf('vulog') === 0) {
            console.warn('some body is trying to play nasty tricks on vulog. ;)')
          // } else if (['keywords'].indexOf(EQUIV_NAMES[mName]) > -1) { // Add all unique words
          //   parsedTags[EQUIV_NAMES[mName]] = addToListAsUniqueItems(parsedTags[EQUIV_NAMES[mName]], cleanTextForEasySearch(m.getAttribute('content')).split(' '))
          } else if (EQUIV_NAMES[mName] === 'domainApp') {
            parsedTags.domainApp = (mName === 'application-name' || !parsedTags.domainApp) ? m.getAttribute('content') : parsedTags.domainApp
          } else if (EQUIV_NAMES[mName] === mName) {
            parsedTags[mName] = m.getAttribute('content')
          } else if (!parsedTags[EQUIV_NAMES[mName]]) {
            parsedTags[EQUIV_NAMES[mName]] = m.getAttribute('content')
          }
          // parsedTags.vSearchWords = addToListAsUniqueItems(parsedTags.vSearchWords, cleanTextForEasySearch(m.getAttribute('content')).split(' '))
        } else if (IGNORE_NAMES.indexOf(mName) < 0 && !options.ignoreNonStandard) {
          parsedTags.other[mName.split('.').join('_')] = m.getAttribute('content')
          if (NON_STD_NAMES.indexOf(mName) < 0) parsedTags.temp_unknown_tags.push(mName)
        }
      }
    }
  }

  parsedTags.domainApp = parsedTags.domainApp ? (parsedTags.domainApp.toLowerCase()) : (domainAppFromUrl(parsedTags.url))
  EMPTY_STR.forEach(tag => { if (parsedTags[tag] === '') delete parsedTags[tag] })
  EMPTY_ARRS.forEach(tag => { if (parsedTags[tag].length === 0) delete parsedTags[tag] })

  if (!parsedTags.isiframe) { // ie is masterpage
    parsedTags.fj_modified_locally = new Date().getTime()
    if (!options.ignoreCookies) parsedTags.vulog_sub_pages = []
  }
  parsedTags.vSearchString = resetVulogKeyWords(parsedTags)
  // parsedTags.vSearchWords = parsedTags.vSearchString.split(' ') // kept temprarily as transition

  return parsedTags
}

// Utility functions specific to pageData
// const renderUrlToCleanedText = function (aUrl) {
//   return addToListAsUniqueItems([], cleanTextForEasySearch(aUrl),
//     function (x) { return ((x + '').length === 1) ? '' : x })
//   // words in title url query (not www) author description url
// }
const haveBody = function () {
  return Boolean(document.getElementsByTagName('BODY') && document.getElementsByTagName('BODY')[0] && document.getElementsByTagName('BODY')[0].scrollHeight)
}
const getCookies = function () {
  var cookies = []
  const carr = document.cookie.split('; ')
  carr.forEach(oneC => { if (oneC) cookies.push(oneC.split('=')[0]) })
  // old: let splits = oneC.split('='); cookies[splits[0].replace(/\./g, '_')] = splits[1]
  return cookies
}
const corePurl = function (aUrl) {
  aUrl = pureUrlify(aUrl)
  return aUrl.split('?')[0]
}
const get3rdPartyLinks = function () {
  var vulog3pjs = []
  var vulog3pimg = []
  var links = document.all
  for (var i = 0; i < links.length; i++) {
    if (links[i].src && startsWith(links[i].src, 'http') && toplevel(links[i].src) !== toplevel(window.location.href)) {
      const isJs = (endsWith(corePurl(links[i].src), 'js'))
      if (isJs) { vulog3pjs.push(links[i].src) } else { vulog3pimg.push(links[i].src) }
    }
  }
  return [vulog3pjs, vulog3pimg]
}
const toplevel = function (url) {
  url = hostFromUrl(url)
  const parts = url.split('.')
  return parts[parts.length - 2] + '.' + parts[parts.length - 1]
}
