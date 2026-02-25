"use strict";

const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const { URL } = require("url");

// Keep a global reference to prevent garbage collection
let mainWindow = null;
//Howdy
const isDev = process.env.NODE_ENV !== "production";

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1280,
		height: 800,
		minWidth: 800,
		minHeight: 600,
		webPreferences: {
			preload: path.join(__dirname, "preload.cjs"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});

	if (isDev) {
		// In development, load from the Nuxt dev server
		const devUrl = process.env.NUXT_DEV_URL || "http://localhost:3000";
		mainWindow.loadURL(devUrl);
		mainWindow.webContents.openDevTools();
	} else {
		// In production, load the generated static files
		const indexPath = path.join(
			__dirname,
			"..",
			".output",
			"public",
			"index.html",
		);
		mainWindow.loadFile(indexPath);
	}

	// Open external links in the default browser instead of Electron
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith("http")) {
			shell.openExternal(url);
			return { action: "deny" };
		}
		return { action: "allow" };
	});

	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

app.whenReady().then(() => {
	createWindow();

	app.on("activate", () => {
		// On macOS, re-create the window when the dock icon is clicked
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on("window-all-closed", () => {
	// On macOS, keep the app running until Command+Q
	if (process.platform !== "darwin") {
		app.quit();
	}
});
