# CapGo - Development Guide 🛠️

This document is intended for developers who want to build, modify, or contribute to CapGo.

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

---

*For user-facing information, please refer to the [README.md](./README.md).*
