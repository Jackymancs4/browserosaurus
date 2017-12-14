import { app, BrowserWindow, Tray, Menu } from 'electron'
import jp from 'jsonpath'
import { spawn } from 'child_process'
import parser from 'xml2json'
import openAboutWindow from 'about-window'
import opn from 'opn'

// import browsers from './browsers'

import memFs from 'mem-fs'
import editor from 'mem-fs-editor'

class Notification {
  constructor(type, msg, disposed = false) {
    this.type = type
    this.msg = msg
    this.disposed = disposed
  }

  setDisposed(val) {
    this.disposed = val
  }

  dispose() {
    this.disposed = true
  }
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let pickerWindow = null
let tray = null
let appIsReady = false

let installedBrowsers = []

let configFileName = '.config/browserosaurus.json'
let wantToQuit = false

let configDefault = {}
let configUser = {}
let notifications = []
var version = app.getVersion()

const loadConfig = () => {
  return new Promise((fulfill, reject) => {
    var configPath = require('os').homedir() + '/' + configFileName
    var configLocalPath = './src/browserosaurus.json'

    var store = memFs.create()
    var fs = editor.create(store)

    var configUserFile = fs.read(configPath, {
      defaults: null
    })
    var configDefaultFile = fs.read(configLocalPath, {
      defaults: null
    })

    if (configUserFile === null) {
      configUserFile = configDefaultFile

      fs.copyTpl(configLocalPath, configPath, {
        version: '1.0.0'
      })

      fs.commit(() => {
        return true
      })
    }

    configDefault = JSON.parse(configDefaultFile)

    try {
      configUser = JSON.parse(configUserFile)
    } catch (e) {
      if (e instanceof SyntaxError) {
        notifications.push(new Notification('error', 'Nothing works'))
        configUser = configDefault
      } else {
        throw e
      }
    }

    //TODO:0 Implement some semVer arithmetic
    if (
      configUser.version !== version &&
      configUser.version !== '<%= version %>'
    ) {
      notifications.push(
        new Notification('warning', 'Please update you configuration file')
      )
    }

    if (getSetting('configMode') == 'override') {
      // Actually, don't do anything
      // browsers = configUserObject.browsers
    } else if (getSetting('configMode') == 'merge') {
      configUser = mergeConfigs(configUser, configDefault)
    }

    // NOTE: Not sure what to pass here, nothing is required
    fulfill(true)
  })
}

const findInstalledBrowsers = () => {
  return new Promise((fulfill, reject) => {
    const sp = spawn('system_profiler', ['-xml', 'SPApplicationsDataType'])

    let profile = ''

    sp.stdout.setEncoding('utf8')
    sp.stdout.on('data', data => {
      profile += data
    })
    sp.stderr.on('data', data => {
      console.log(`stderr: ${data}`)
      reject(data)
    })
    sp.stdout.on('end', () => {
      profile = parser.toJson(profile, {
        object: true
      })
      const installedApps = jp.query(
        profile,
        'plist.array.dict.array[1].dict[*].string[0]'
      )
                  "You're a dev, I knew it! Please open an issue about this wonderful browser.."

      // NOTE: Algorithmically speaking this whole thing is an overkill, but working with small numers it will be fine
      installedBrowsers = configUser.browsers
        .map(browser => {
          // Quoting @will-stone from https://github.com/will-stone/browserosaurus/issues/13
          // Not on defaults list, not in profiler results: *Notification says: "Google Chrome Error" not currently supported or found on this Mac.
          if (installedApps.indexOf(browser.name) == -1) {
            notifications.push(
              new Notification('error', 'Browser/app not found.')
            )
            return false
          } else {
            // Not on defaults list, in profiler results (therefore shown with no icon): *Notification says: "Beaker Browser" not officially supported, please ask Browserosaurus to add this browser.
            if (
              configDefault.browsers
                .map(defaultBrowser => {
                  if (defaultBrowser.name == browser.name) {
                    return true
                  } else {
                    return false
                  }
                })
                .filter(x => x).length == 0
            ) {
              notifications.push(
                new Notification(
                  'warning',
                  'Youtra dev, I knew it! Please open an issue about this wonderful browser..'
                )
              )
              browser.icon = 'Custom'
            }
            return browser
          }
        })
        .filter(x => x)

      // TODO:10 remove debugging printouts
      console.log(notifications)

      fulfill(installedBrowsers)
    })
  })
}

// TODO: Something, but not now
function mergeConfigs(userConfigLocal, configDefaultLocal) {
  var browsersUser = userConfigLocal.browsers
  var browsersDefaults = configDefaultLocal.browsers

  var browsersUserNames = browsersUser.map(browser => {
    return browser.name
  })

  browsersDefaults = browsersDefaults
    .map(browser => {
      if (browsersUserNames.indexOf(browser.name) == -1) {
        return browser
      }
    })
    .filter(x => x)

  userConfigLocal.browsers = userConfigLocal.browsers.concat(browsersDefaults)

  return userConfigLocal
}

function getSetting(key) {
  if ('settings' in configUser) {
    if (key in configUser.settings) {
      return configUser.settings[key]
    } else {
      return configDefault.settings[key]
    }
  } else {
    return configDefault.settings[key]
  }
}

function createTrayIcon() {
  tray = new Tray(`${__dirname}/images/icon/tray_iconTemplate.png`)
  tray.setPressedImage(`${__dirname}/images/icon/tray_iconHighlight.png`)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Preferences',
      click: function() {
        opn(require('os').homedir() + '/' + configFileName)
      }
    },
    {
      label: 'About',
      click: function() {
        openAboutWindow({
          icon_path: `${__dirname}/images/icon/icon.png`
        })
      }
    },
    {
      label: 'Quit',
      click: function() {
        wantToQuit = true
        app.quit()
      }
    }
  ])
  tray.setToolTip('Browserosaurus')
  tray.setContextMenu(contextMenu)

  return null
}
/**
 * Create picker window
 *
 * Creates the window that is used to display browser selection after clicking
 * a link.
 * @param {Function} callback function to run after this one finishes.
 */
function createPickerWindow(callback) {
  pickerWindow = new BrowserWindow({
    width: 400,
    height: 64 + 48,
    acceptFirstMouse: true,
    alwaysOnTop: true,
    icon: `${__dirname}/images/icon/icon.png`,
    frame: false,
    resizable: false,
    movable: false,
    show: false,
    title: 'Browserosaurus',
    hasShadow: true,
    backgroundColor: '#111111'
  })

  pickerWindow.loadURL(`file://${__dirname}/index.html`)

  pickerWindow.on('close', e => {
    //if (wantToQuit == false) {
    //e.preventDefault()
    pickerWindow.hide()
    //}
  })

  pickerWindow.on('blur', () => {
    pickerWindow.webContents.send('close', true)
  })

  if (callback) {
    callback()
  }
}

/**
 * Send URL to picker
 *
 * When url is clicked, this sends the url to the picker renderer so browsers
 * know what to open.
 * @param {String} url clicked link.
 */
function sendUrlToRenderer(url) {
  pickerWindow.center() // moves window to current screen
  pickerWindow.webContents.send('incomingURL', url)
}

/**
 * App on ready
 *
 * Run once electron has loaded and the app is considered _ready for use_.
 */
app.on('ready', () => {
  // Prompt to set as default browser
  app.setAsDefaultProtocolClient('http')

  loadConfig().then(() => {
    createTrayIcon()
    createPickerWindow(() => {
      pickerWindow.once('ready-to-show', () => {
        if (global.URLToOpen) {
          sendUrlToRenderer(global.URLToOpen)
          global.URLToOpen = null
        }
        appIsReady = true
      })
    })
    findInstalledBrowsers().then(installedBrowsers => {
      console.log(installedBrowsers)
      pickerWindow.webContents.send('incomingBrowsers', installedBrowsers)
    })
  })
  //)
})

// Hide dock icon
app.dock.hide()

app.on('open-url', (event, url) => {
  event.preventDefault()
  if (appIsReady) {
    sendUrlToRenderer(url)
  } else {
    global.URLToOpen = url // this will be handled later in the createWindow callback
  }
})
