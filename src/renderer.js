const electron = require('electron')
const opn = require('opn')
const currentWindow = electron.remote.getCurrentWindow()
const Mousetrap = require('mousetrap')
let url = null
const browserList = document.getElementById('browserList')
const urlField = document.getElementById('url')

const closeWindow = () => {
  urlField.innerText = ''

  setTimeout(() => {
    // if not paused, escape causes an audible error (beep). Presumably there's some sort of race condition here. Anyway, the timeout seems to solve it.
    currentWindow.hide()
    url = null
  }, 0)
}

// Listen for URL
electron.ipcRenderer.on('incomingURL', (event, message) => {
  urlField.innerText = message
  url = message
  currentWindow.show()
})

electron.ipcRenderer.on('close', () => {
  closeWindow()
})

Mousetrap.bind('esc', () => {
  closeWindow()
})

Mousetrap.bind('command+,', () => {
  opn(require('os').homedir() + '/' + configFileName)
})

const openBrowser = appName =>
  opn(url, { app: appName, wait: false })
    .then(() => closeWindow())
    .catch(() =>
      alert(
        'Oh no! An error just occurred, please report this as a  GitHub issue. Opened URL was ' +
          url
      )
    )

// Listen for installedBrowsers
electron.ipcRenderer.on(
  'installedBrowsers',
  (event, installedBrowsers, notifications, settings) => {
    const listKeys = []

    document.getElementById('loading').style.display = 'none'
    installedBrowsers
      .map(browser => {
        // use alias as label if available, otherwise use name
        if (!browser.alias) {
          browser.alias = browser.name
        }
        return browser
      })
      .sort((a, b) => {
        // alphabetise

        if (settings.autoOrdering) {
          if (a.alias < b.alias) return -1
          if (a.alias > b.alias) return 1
        }
        return 0
      })
      .map(browser => {
        const listItem = document.createElement('li')

        browser.key = browser.key.trim()[0]

      listItem.addEventListener('click', () => {
        listItem.classList.remove('active')
        openBrowser(browser.name)
      })
      listItem.addEventListener('mouseenter', () => {
        listItem.classList.add('active')
      })
      listItem.addEventListener('mouseleave', () => {
        listItem.classList.remove('active')
      })

      browserList.appendChild(listItem)

      Mousetrap.bind(browser.key, () => {
        listItem.classList.add('active')
        setTimeout(() => {
          listItem.classList.remove('active')
          openBrowser(browser.name)
        }, 200)
      })
  }
)
