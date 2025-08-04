// load_highlights.js
// Compare iosApp vs ChromeExtension  - verified against iosApp 2022-07-05

// Highligher FUNCTIONS from github.com/jeromepl/highlighter

/* global chrome, vState, detectChromesPDFViewer, isHiperCardsPdfHighlighter overlayUtils,  showVulogOverlay, highlightFromSelection, mapColor, HIGHLIGHT_CLASS */
let freezrMeta = null // used to pass onto overlay => utils to see if isOwnComment

const initiateHighlights = function () {
  if (vState.pageInfoFromPage && !vState.pageInfoFromPage.isiframe) {
    const overlayOuter = document.getElementById('vulog_overlay_outer') || overlayUtils.makeEl('div', 'vulog_overlay_outer', 'cardOuter', '')
    // nb div only exists when 
    overlayOuter.style.display = 'none'
    document.body.appendChild(overlayOuter)

    updateStatefromBackground(function () { 
      if (detectChromesPDFViewer()) {
        // onsole.log('🎯 PDF viewer detected! Checking for existing highlights...');
        if (isIos()) console.warn('🎯 PDF viewer detected! on ios - check what to d on safari')
        const hasExistingHighlights = hasHighlights(vState[vState.showThis])
        if (hasExistingHighlights) {
          showPDFHighlightingDialog(hasExistingHighlights)
        } else {
          showEnableHighlightingButton()
        }
      } else {
        // onsole.log('Not a PDF viewer, proceeding with normal highlight loading');
        vState.displayErrs = showHighlights()
        if (vState.displayErrs && vState.displayErrs.length > 0) {
          chrome.runtime.sendMessage({ purl: vState.pageInfoFromPage.purl, msg: 'marksDisplayErrs', display_errs: vState.displayErrs }, function (response) {
            // onsole.log(response)
            vState.showVulogOverlay()
          })
          // vState.showVulogOverlay('Some errors occured in displaying highlights. ' + errCount + (errCount === 1 ? ' highlight was not shown.' : ' highlights were not shown.'))
        } else if (vState.ownMark || vState.redirectmark || vState.messageMark) {
          vState.showVulogOverlay()
        } else {
          console.warn('vState NOT showing ovelay  ', { haveMark: Boolean(vState.ownMark), haveMessages: Boolean(vState.messageMark), haveRedirect: Boolean(vState.redirectmark) })
        }
      }
    })

  }
}

const hasHighlights = function (mark) {
  return (mark?.vHighlights && mark.vHighlights.length > 0)
}
const showHighlights = function () {
  if (!vState.showThis) console.warn('No showThis ? SNBH')
  const showThis = vState.showThis || 'ownMark'
  const displayErrs = []
  // let color = 'yellowgreen'
  const toshow = vState[showThis]

  // if (showThis === 'redirect_mark') color = 'yellow'
  if (hasHighlights(toshow)) {
    // const highlights =  JSON.parse(JSON.stringify(toshow.vHighlights))
    toshow.vHighlights.forEach((aHighlight, idx) => {
      const highlightCopy = JSON.parse(JSON.stringify(aHighlight))
      
      // Check if this is a PDF highlight (has coordinates)
      if (highlightCopy.coordinates && highlightCopy.pageNumber) {
        // Handle PDF highlight display
        if (typeof displayPDFHighlights === 'function') {
          try {
            displayPDFHighlights([highlightCopy]);
          } catch (error) {
            console.warn('Error showing PDF highlight: ', { highlightCopy, error })
            chrome.runtime.sendMessage({ msg: 'hlightDisplayErr', hlightId: aHighlight.id, url: window.location.href }, function (response) {
            })
            displayErrs.push({ err: true, idx: idx, id: aHighlight.id })
          }
        } else {
          console.warn('displayPDFHighlights function not available for PDF highlight')
          displayErrs.push({ err: true, idx: idx, id: aHighlight.id })
        }
      } else {
        // Handle regular text highlight
        if (!loadHighlights(highlightCopy)) {
          console.warn('Error showing highlight: ', { highlightCopy })
          chrome.runtime.sendMessage({ msg: 'hlightDisplayErr', hlightId: aHighlight.id, url: window.location.href }, function (response) {
          })
          displayErrs.push({ err: true, idx: idx, id: aHighlight.id }) // old versiona s of ovt 24 2022
        }
      }
      // else if (aHighlight.display_err) displayErrs.push({ err: false, idx: idx, id: aHighlight.id })
    })
  } else {
    console.warn('No highligths to show')
  }

  return displayErrs
}

function loadHighlights (highlightObj) {
  // onsole.log('loadHighlights', highlightObj)
  var selection = {
    anchorNode: elementFromQuery(highlightObj.anchorNode, 'anchor', highlightObj.string),
    anchorOffset: highlightObj.anchorOffset,
    focusNode: elementFromQuery(highlightObj.focusNode, 'focus', highlightObj.string),
    focusOffset: highlightObj.focusOffset
  }

  // onsole.log(selection)

  var container = elementFromQuery(highlightObj.container)

  if (!selection.anchorNode || !selection.focusNode || !container) {
    console.warn('NO Anchor or focusNode...', selection)
    // return false

    // Use document.body as fallback container if container is null
    const fallbackContainer = container || document.body
    const fallbackSuccess = fallbackHighlightFromString(highlightObj, fallbackContainer)
    if (!fallbackSuccess) {
      console.warn('Both original and fallback highlighting failed for:', highlightObj.string)
    }
    return fallbackSuccess
  } else {
    // const success = highlightFromSelection(selectionString, container, selection, mapColor(highlightObj.color), highlightObj.id) // returns true on success or false on err
    const success = highlightFromSelection(highlightObj, selection, container) // returns true on success or false on err

    if (!success) {
      console.warn('could not load highlight ', selection)
      // Fallback: search for the text string in the page content
      const fallbackSuccess = fallbackHighlightFromString(highlightObj, container)
      if (!fallbackSuccess) {
        console.warn('Both original and fallback highlighting failed for:', highlightObj.string)
      }
      return fallbackSuccess
    } else {
      // onsole.log('success in highlighting')
    }
    return success
  }
}

// Fallback function to highlight text by searching for the string in the page content
function fallbackHighlightFromString(highlightObj, container) {
  const searchString = highlightObj.string
  const color = mapColor(highlightObj.color)
  const id = highlightObj.id
  const hasComment = (highlightObj.vComments && highlightObj.vComments.length > 0)
    
  // First try the provided container
  let searchContainer = container
  let textContent = searchContainer.textContent || searchContainer.innerText || ''
  let searchIndex = textContent.indexOf(searchString)
  
  if (searchIndex === -1) {
    // Try case-insensitive search in the provided container
    searchIndex = textContent.toLowerCase().indexOf(searchString.toLowerCase())
    if (searchIndex === -1) {
      // If still not found, try document.body as ultimate fallback
      searchContainer = document.body
      textContent = searchContainer.textContent || searchContainer.innerText || ''
      searchIndex = textContent.indexOf(searchString)
      
      if (searchIndex === -1) {
        // Try case-insensitive search in document.body
        searchIndex = textContent.toLowerCase().indexOf(searchString.toLowerCase())
        if (searchIndex === -1) {
          console.warn('Fallback: Could not find text string in any container (case-sensitive or case-insensitive)', { searchString, containerUsed: container === document.body ? 'document.body' : 'original container' })
          // last recourse - give time for page to fully load... 
          setTimeout(() => {
            const successontry2 = fallbackHighlightFromString(highlightObj, document.body)
            if (successontry2) {
              // find highlight id in displahy errs and remove it
              const highlightId = highlightObj.id
              const index = vState.displayErrs.findIndex(err => err.id === highlightId)
              if (index !== -1) {
                vState.displayErrs.splice(index, 1)
              }
              chrome.runtime.sendMessage({ purl: vState.pageInfoFromPage.purl, msg: 'marksDisplayErrs', display_errs: vState.displayErrs }, function (response) {
                // onsole.log(response)
                vState.showVulogOverlay()
              })
            } else {
              // console.warn('Fallback highlight failed on try 2')
            }
          }, 2000)
          return false
        }
      }
    }
  }
  
  // Check if there are multiple instances of the text
  const allOccurrences = findAllOccurrences(textContent, searchString)
  if (allOccurrences.length > 1) {    
    // Choose the best occurrence based on context
    const bestIndex = selectBestOccurrence(allOccurrences, searchString, searchContainer)
    searchIndex = bestIndex
    
    console.warn(`Found ${allOccurrences.length} instances of text. Selected occurrence at index ${bestIndex} out of ${allOccurrences.length} options`, { searchString })
  }
  
  // Find the text nodes that contain our search string
  const textNodes = findTextNodesInRange(searchContainer, searchIndex, searchIndex + searchString.length, searchString)
  
  if (textNodes.length === 0) {
    console.warn('Fallback: Could not find text nodes containing the search string')
    return false
  }
  
  // Apply highlighting to the found text nodes
  let highlightedLength = 0
  
  for (let i = 0; i < textNodes.length; i++) {
    const textNodeInfo = textNodes[i]
    const textNode = textNodeInfo.node
    const nodeText = textNode.nodeValue
    const startOffset = textNodeInfo.startOffset
    const endOffset = textNodeInfo.endOffset
    
    if (startOffset < endOffset && startOffset >= 0 && endOffset <= nodeText.length) {
      // Split the text node and wrap the highlighted portion
      const beforeText = nodeText.substring(0, startOffset)
      const highlightedText = nodeText.substring(startOffset, endOffset)
      const afterText = nodeText.substring(endOffset)
      
      // Create the highlighted span
      const highlightSpan = document.createElement('span')
      highlightSpan.id = 'vulog_hlight_' + id
      highlightSpan.className = HIGHLIGHT_CLASS + (hasComment ? ' hlightComment' : '')
      highlightSpan.style.backgroundColor = color
      highlightSpan.textContent = highlightedText
      
      // Replace the text node with our new structure
      const fragment = document.createDocumentFragment()
      
      if (beforeText) {
        fragment.appendChild(document.createTextNode(beforeText))
      }
      fragment.appendChild(highlightSpan)
      if (afterText) {
        fragment.appendChild(document.createTextNode(afterText))
      }
      
      textNode.parentNode.replaceChild(fragment, textNode)
      
      highlightedLength += highlightedText.length
    }
  }
    
  // Verify that the highlight was actually applied by checking if the span exists
  const highlightSpan = document.getElementById('vulog_hlight_' + id)
  if (highlightSpan) {
    return true
  } else {
    console.warn('Fallback highlight verification: span not found in DOM for ', id)
    return false
  }
}

// Helper function to find text nodes in a specific range
function findTextNodesInRange(container, startIndex, endIndex, searchString) {
  const textNodes = []
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
    false
  )
  
  let currentOffset = 0
  let node = walker.nextNode()
  
  while (node) {
    const nodeLength = node.nodeValue.length
    
    // Check if this text node overlaps with our target range
    if (currentOffset + nodeLength > startIndex && currentOffset < endIndex) {
      textNodes.push({
        node: node,
        startOffset: Math.max(0, startIndex - currentOffset),
        endOffset: Math.min(nodeLength, endIndex - currentOffset)
      })
    }
    
    currentOffset += nodeLength
    node = walker.nextNode()
  }
  
  // If no text nodes found, try a simpler approach: find any text node containing the string
  if (textNodes.length === 0) {
    console.warn('No text nodes found in range, trying alternative approach for ', { searchString })
    const walker2 = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null,
      false
    )
    
    let node2 = walker2.nextNode()
    while (node2) {
      const nodeText = node2.nodeValue
      // Try to find the search string in this text node
      const stringIndex = nodeText.toLowerCase().indexOf(searchString.toLowerCase())
      if (stringIndex !== -1) {
        textNodes.push({
          node: node2,
          startOffset: stringIndex,
          endOffset: stringIndex + searchString.length
        })
        break // Found the first occurrence
      }
      node2 = walker2.nextNode()
    }
  }
  
  return textNodes
}

// Helper function to find all occurrences of a string in text content
function findAllOccurrences(textContent, searchString) {
  const occurrences = []
  let index = 0
  
  // Find all case-sensitive occurrences
  while ((index = textContent.indexOf(searchString, index)) !== -1) {
    occurrences.push(index)
    index += 1 // Move past this occurrence
  }
  
  // If no case-sensitive matches found, try case-insensitive
  if (occurrences.length === 0) {
    const lowerText = textContent.toLowerCase()
    const lowerSearch = searchString.toLowerCase()
    index = 0
    while ((index = lowerText.indexOf(lowerSearch, index)) !== -1) {
      occurrences.push(index)
      index += 1
    }
  }
  
  return occurrences
}

// Helper function to select the best occurrence when multiple instances exist
function selectBestOccurrence(occurrences, searchString, container) {
  if (occurrences.length === 0) return -1
  if (occurrences.length === 1) return occurrences[0]
  
  // Strategy 1: Prefer occurrences that are visible (not in hidden elements)
  const visibleOccurrences = occurrences.filter(index => {
    const textNodes = findTextNodesInRange(container, index, index + searchString.length, searchString)
    return textNodes.some(textNodeInfo => {
      const element = textNodeInfo.node.parentElement
      if (!element) return true
      
      // Check if element is visible
      const style = window.getComputedStyle(element)
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
    })
  })
  
  if (visibleOccurrences.length > 0) {
    // Strategy 2: Among visible occurrences, prefer those in main content areas
    const mainContentOccurrences = visibleOccurrences.filter(index => {
      const textNodes = findTextNodesInRange(container, index, index + searchString.length, searchString)
      return textNodes.some(textNodeInfo => {
        const element = textNodeInfo.node.parentElement
        if (!element) return true
        
        // Check if element is in main content areas (main, article, section, etc.)
        const mainContentSelectors = ['main', 'article', 'section', '.content', '.main', '#content', '#main']
        return mainContentSelectors.some(selector => {
          return element.closest(selector) !== null
        })
      })
    })
    
    if (mainContentOccurrences.length > 0) {
      // Strategy 3: Among main content occurrences, prefer the first one (most likely to be the intended highlight)
      return mainContentOccurrences[0]
    } else {
      // If no main content occurrences, use the first visible one
      return visibleOccurrences[0]
    }
  }
  
  // If no visible occurrences found, fall back to the first occurrence
  return occurrences[0]
}

// Helper function to get replacements (copied from highlight.js)
function getReplacements(color, id, hasComment) {
  return {
    start: '<span id="vulog_hlight_' + id + '" class="' + HIGHLIGHT_CLASS + (hasComment ? ' hlightComment' : '') + '" style="background-color: ' + color + ';">',
    end: '</span>'
  }
}
function elementFromQuery (storedQuery, eltype, thestring) {
  // onsole.log('elementFromQuery',{thestring})
  let lastNode
  var aquery = storedQuery[0]
  if (!storedQuery || storedQuery.length === 0) console.warn('NO Query sent')
  if (!storedQuery || storedQuery.length === 0) {
    return null
  } else if (aquery.id) {
    lastNode = document.getElementById(aquery.id)
  } else if (aquery.nodeId) { // 2022 added for ios
    lastNode = document.getElementById(aquery.nodeId) // due to ios conversion
  } else if (aquery.type === 'html') {
    lastNode = document.getElementsByTagName('html')[0]
  }

  if (!lastNode) console.warn('1 No First node found for ', storedQuery, thestring)

  storedQuery.shift()
  while (lastNode && storedQuery.length > 0) {
    let currentChild = -1
    let targetChild = storedQuery[0].index
    while (currentChild < targetChild) {
      currentChild++
      if (storedQuery.length === 1) {
        if (lastNode.childNodes[currentChild] && lastNode.childNodes[currentChild].className === HIGHLIGHT_CLASS) {
          targetChild += 1
        } else if (lastNode.childNodes[currentChild] && lastNode.childNodes[currentChild].nextSibling && lastNode.childNodes[currentChild].nextSibling.className === HIGHLIGHT_CLASS) {
          targetChild += 2
          currentChild++
        }
      }
    }
    lastNode = lastNode.childNodes[currentChild]

    // fix? put while statement to traverse
    if (!lastNode || !((lastNode.localName === undefined && storedQuery[0].type === 'text') ||
        lastNode.localName === storedQuery[0].type)) {
      console.warn('Got typemismatch on ', { lastNode, storedQuery, eltype, thestring })
    }
    storedQuery.shift()
  }

  if (!lastNode) console.warn('No First node found for ' + eltype + ' ' + thestring, storedQuery)

  return lastNode
}

/* 
  PDF Related Highlighting



*/

if (
  document.readyState === 'complete' ||
  (document.readyState !== 'loading' && !document.documentElement.doScroll)
) {
  // 2023-04 - reduce times - if notintiating highlights recheck to see if reduced too much - from 10s & 5s respectively
  setTimeout(function () {
    console.log('Document ready, initiating highlights')
    initiateHighlights()
  }, 1000) // previousl 2
} else {
    setTimeout(async function () {
      document.addEventListener('DOMContentLoaded', function() {
        console.log('DOM loaded, initiating highlights')
        initiateHighlights()
      })
  }, 3000) // previousl 4
}
