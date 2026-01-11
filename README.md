# CapGo 🖊️ 📄

**CapGo** is a fast, modern, and cross-platform desktop application designed for stamping and signing PDF documents with ease. Built with Go and React, it provides a seamless experience for professionals who need to apply signatures or official stamps to multiple PDF files quickly and accurately.

## 📥 Download

You can download the latest version of CapGo for macOS directly from the **[Releases](https://github.com/Lelehuy/CapGo/releases)** page.

1.  Download the `CapGo Installer.dmg`.
2.  Open the file and drag **CapGo** to your **Applications** folder.
3.  Launch CapGo from your Applications!

## ✨ Features

- **Drag & Drop Workflow**: Easily import your PDF files and stamp images.
- **Interactive Stamp Placement**: Move and resize stamps directly on a live PDF preview.
- **Batch Processing**: Apply an active stamp layout to all selected PDF documents in one click.
- **Multi-page Support**: Place different stamps on different pages of the same document.
- **Professional Export**: High-quality PDF generation with integrated stamping.
- **Secure by Design**: All processing happens locally on your machine—your documents never leave your computer.
- **Dark Mode UI**: A premium, sleek aesthetic designed for focus and productivity.

## 🛠️ Technology Stack

- **Backend**: [Go](https://go.dev/) (Golang)
- **Frontend**: [React](https://reactjs.org/) with [TypeScript](https://www.typescriptlang.org/)
- **Desktop Framework**: [Wails v2](https://wails.io/)
- **PDF Rendering**: [React-PDF](https://projects.wojtekmaj.pl/react-pdf/)
- **Bundler**: [Vite](https://vitejs.dev/)
- **Styling**: Vanilla CSS with modern aesthetics.

## 🚀 Getting Started

### Prerequisites

- [Go](https://go.dev/dl/) 1.18+
- [Node.js](https://nodejs.org/) & npm
- [Wails CLI](https://wails.io/docs/gettingstarted/installation)

### Development Mode

To run CapGo in development mode with hot-reload:

```bash
wails dev
```

### Building the Application

To build the production application:

```bash
wails build
```

The resulting binary will be located in the `build/bin` directory.

### Packaging (macOS)

We provide a custom script to build and package the application into a `.dmg` installer:

```bash
chmod +x package.sh
./package.sh
```

Your installer will be available in the `Release/` folder.

## 📂 Project Structure

- `frontend/`: React source code (TypeScript, CSS).
- `build/`: Asset files and build configurations.
- `app.go`: Main application logic and Go/JS bridge.
- `main.go`: Entry point for the Wails application.
- `Release/`: Directory for final platform-specific installers.

## 📄 License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

---

*Developed with ❤️ by Lelehuy.*
