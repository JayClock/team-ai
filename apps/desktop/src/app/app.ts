import { BrowserWindow, ipcMain, screen } from 'electron';
import { rendererAppName, rendererAppPort } from './constants';
import { environment } from '../environments/environment';
import { join } from 'path';
import { format } from 'url';
import { LocalServerManager } from './local-server';
import { desktopRuntimeChannel } from './api/runtime-config';

export default class App {
  static mainWindow: BrowserWindow | null = null;
  static application: Electron.App;
  public static isDevelopmentMode() {
    const isEnvironmentSet: boolean = 'ELECTRON_IS_DEV' in process.env;
    const getFromEnvironment = () =>
      parseInt(process.env.ELECTRON_IS_DEV!, 10) === 1;

    return isEnvironmentSet ? getFromEnvironment() : !environment.production;
  }

  private static onWindowAllClosed() {
    if (process.platform !== 'darwin') {
      App.application.quit();
    }
  }

  private static async onReady() {
    if (!rendererAppName) {
      return;
    }

    try {
      await LocalServerManager.start(App.application);
      App.initMainWindow();
      App.loadMainWindow();
    } catch (error) {
      console.error(error);
      App.application.quit();
    }
  }

  private static onActivate() {
    if (App.mainWindow === null) {
      void App.onReady();
    }
  }

  private static initMainWindow() {
    const workAreaSize = screen.getPrimaryDisplay().workAreaSize;
    const width = Math.min(1280, workAreaSize.width || 1280);
    const height = Math.min(720, workAreaSize.height || 720);

    App.mainWindow = new BrowserWindow({
      width: width,
      height: height,
      show: false,
      webPreferences: {
        contextIsolation: true,
        backgroundThrottling: false,
        preload: join(__dirname, 'main.preload.js'),
      },
    });
    App.mainWindow.setMenu(null);
    App.mainWindow.center();

    App.mainWindow.once('ready-to-show', () => {
      App.mainWindow!.show();
    });

    App.mainWindow.on('closed', () => {
      App.mainWindow = null;
    });
  }

  private static loadMainWindow() {
    if (!App.application.isPackaged) {
      App.mainWindow!.loadURL(`http://localhost:${rendererAppPort}`);
    } else {
      App.mainWindow!.loadURL(
        format({
          pathname: join(__dirname, '..', rendererAppName, 'index.html'),
          protocol: 'file:',
          slashes: true,
        }),
      );
    }
  }

  static main(app: Electron.App, browserWindow: typeof BrowserWindow) {
    App.application = app;

    ipcMain.handle('get-app-version', () => App.application.getVersion());
    ipcMain.handle(desktopRuntimeChannel, () => {
      const runtimeConfig = LocalServerManager.getRuntimeConfig();

      if (!runtimeConfig) {
        throw new Error('Local server is not ready');
      }

      return runtimeConfig;
    });

    App.application.on('window-all-closed', App.onWindowAllClosed);
    App.application.on('before-quit', () => {
      void LocalServerManager.stop();
    });
    App.application.on('ready', () => {
      void App.onReady();
    });
    App.application.on('activate', App.onActivate);
  }
}
