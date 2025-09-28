const isIos = function () {
  //  console.warn("TEMP -> SIMULATING IOS")
  //  return true
  const platform = navigator?.userAgent || 'unknown'
  return (/iPhone|iPod|iPad/.test(platform)) ||
    // iPad on iOS 13 detection
    (navigator.userAgent.includes('Mac') && 'ontouchend' in document)
}

const COLOR_MAP = { // Modern highlighting colors
  green: '#4CAF50',                // Lighter green (Material Design green)
  yellow: '#FFD700',               // Golden yellow - better for highlighting
  blue: '#2196F3',                 // Darker blue (Material Design blue)
  pink: '#E91E63',                 // Darker pink (Material Design pink)
  grey: '#9E9E9E',                 // Darker grey (Material Design grey)
  orange: '#FF9800'               // Darker orange (Material Design orange)
  // purple: '#9C27B0',               // Darker purple (Material Design purple)
  // cyan: '#00BCD4'                  // Darker cyan (Material Design cyan)
}

document.addEventListener('DOMContentLoaded', function () {

  const highlightOuters = document.querySelectorAll('.highlightOuter')
  highlightOuters.forEach(function (highlightOuter) {
    const hColor = highlightOuter.getAttribute('hColor')
    highlightOuter.firstElementChild.style.border = COLOR_MAP[hColor]
    ? `2px solid ${COLOR_MAP[hColor]}` : '2px solid #4CAF50'
    const children = highlightOuter.querySelectorAll('*')
    children.forEach(child => {
      child.style.color = COLOR_MAP[hColor] || '#4CAF50'
    })
  })
  setTimeout(function () {
    if (isIos()) {
      document.getElementById('vulog_show_if_extension_is_installed').style.display = 'none'
      document.getElementById('vulog_show_if_NOT_installed').style.display = 'none'
      document.getElementById('vulog_show_if_IOS').style.display = 'block'
      const href = document.getElementById('IOS_LINK').href
      const parts = window.location.href.split('?')
      const finalQuery = '?url=' + parts[0] + '&mark=' + parts[0] + '&' + (parts[1] || 'nocodes=true') 
      document.getElementById('IOS_LINK').href = 'hipercards://link' + finalQuery
    }
  }, 500)
})