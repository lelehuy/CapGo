package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	_ "image/jpeg"

	"github.com/nfnt/resize"
	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// GetFile reads a file and returns its contents
func (a *App) GetFile(path string) ([]byte, error) {
	fmt.Printf("Backend: GetFile called for path: %s\n", path)
	data, err := os.ReadFile(path)
	if err != nil {
		fmt.Printf("Backend: Error reading file: %v\n", err)
		return nil, err
	}
	fmt.Printf("Backend: Read %d bytes\n", len(data))
	return data, nil
}

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// SelectFile opens a file dialog and returns the selected path
func (a *App) SelectFile(title string, filter string) (string, error) {
	selection, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: title,
		Filters: []runtime.FileFilter{
			{DisplayName: title, Pattern: filter},
		},
	})
	if err != nil {
		return "", err
	}
	return selection, nil
}

// SelectFiles opens a file dialog for multiple files and returns their paths
func (a *App) SelectFiles(title string, filter string) ([]string, error) {
	selections, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title: title,
		Filters: []runtime.FileFilter{
			{DisplayName: title, Pattern: filter},
		},
	})
	if err != nil {
		return nil, err
	}
	return selections, nil
}

// OpenFile opens a file using the system's default application
func (a *App) OpenFile(path string) error {
	// Clean path
	path = filepath.Clean(path)
	// Use 'open' command on macOS
	return exec.Command("open", path).Run()
}

// StampInfo represents the metadata for a single stamp
type StampInfo struct {
	Image   string  `json:"image"`
	X       float64 `json:"x"`
	Y       float64 `json:"y"`
	Width   float64 `json:"width"`
	Height  float64 `json:"height"`
	PageNum int     `json:"pageNum"`
}

// StampPDF stamps multiple images onto a PDF and returns the final file path
func (a *App) StampPDF(pdfPath string, stamps []StampInfo) (string, error) {
	// Clean paths
	pdfPath = filepath.Clean(pdfPath)

	if len(stamps) == 0 {
		return pdfPath, nil
	}

	// Final Output path: Downloads folder
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("could not get home directory: %v", err)
	}
	ext := filepath.Ext(pdfPath)
	baseName := strings.TrimSuffix(filepath.Base(pdfPath), ext)

	// Create a clean base name (remove previous _capgo if present)
	cleanBase := strings.Split(baseName, "_capgo")[0]

	// Generate unique name
	outputPath := filepath.Join(homeDir, "Downloads", fmt.Sprintf("%s_capgo%s", cleanBase, ext))
	counter := 1
	for {
		if _, err := os.Stat(outputPath); os.IsNotExist(err) {
			break
		}
		outputPath = filepath.Join(homeDir, "Downloads", fmt.Sprintf("%s_capgo (%d)%s", cleanBase, counter, ext))
		counter++
	}

	currentInput := pdfPath

	// Process each stamp
	for i, stamp := range stamps {
		// Output for this step
		var stepOutput string
		if i == len(stamps)-1 {
			stepOutput = outputPath
		} else {
			tempFile, err := os.CreateTemp("", "intermediate_*.pdf")
			if err != nil {
				return "", fmt.Errorf("failed to create intermediate pdf: %v", err)
			}
			tempFile.Close()
			stepOutput = tempFile.Name()
			defer os.Remove(stepOutput)
		}

		// Log page dimensions for debugging
		dims, err := api.PageDimsFile(currentInput)
		if err != nil {
			return "", fmt.Errorf("failed to get page dimensions for %s: %v", currentInput, err)
		}
		if len(dims) == 0 {
			return "", fmt.Errorf("no page dimensions found for %s", currentInput)
		}
		// Assuming all pages have the same dimensions, or we only care about the first page's dimensions
		// for coordinate calculations.
		pdfHeight := dims[0].Height

		// Process image
		var srcImage image.Image
		if strings.Contains(stamp.Image, ";base64,") {
			parts := strings.Split(stamp.Image, ",")
			if len(parts) < 2 {
				return "", fmt.Errorf("invalid base64 data format for stamp %d", i)
			}
			data, err := base64.StdEncoding.DecodeString(parts[1])
			if err != nil {
				return "", fmt.Errorf("failed to decode base64 image %d: %v", i, err)
			}
			srcImage, _, err = image.Decode(bytes.NewReader(data))
			if err != nil {
				return "", fmt.Errorf("failed to decode image %d from base64: %v", i, err)
			}
		} else {
			imagePath := filepath.Clean(stamp.Image)
			file, err := os.Open(imagePath)
			if err != nil {
				return "", fmt.Errorf("failed to open image file %d: %v", i, err)
			}
			srcImage, _, err = image.Decode(file)
			file.Close()
			if err != nil {
				return "", fmt.Errorf("failed to decode image file %d: %v", i, err)
			}
		}

		// Preserve Aspect Ratio (Equivalent to object-fit: contain)
		imgWidth := float64(srcImage.Bounds().Dx())
		imgHeight := float64(srcImage.Bounds().Dy())

		targetRatio := stamp.Width / stamp.Height
		imgRatio := imgWidth / imgHeight

		var finalW, finalH float64
		var offX, offY float64 // Offset within the stamp.Width/Height box

		if imgRatio > targetRatio {
			// Image is wider than the target box aspect ratio, so its width will fill the box
			finalW = stamp.Width
			finalH = stamp.Width / imgRatio
			offX = 0
			offY = (stamp.Height - finalH) / 2
		} else {
			// Image is taller than or equal to the target box aspect ratio, so its height will fill the box
			finalH = stamp.Height
			finalW = stamp.Height * imgRatio
			offX = (stamp.Width - finalW) / 2
			offY = 0
		}

		// HD Resizing (4x for sharpness)
		qualityFactor := 4.0
		resizedImg := resize.Resize(uint(finalW*qualityFactor), uint(finalH*qualityFactor), srcImage, resize.Lanczos3)

		// Create temp PNG for watermark
		imgTemp, err := os.CreateTemp("", "stamp_*.png")
		if err != nil {
			return "", fmt.Errorf("failed to create temp stamp %d: %v", i, err)
		}
		if err := png.Encode(imgTemp, resizedImg); err != nil {
			imgTemp.Close()
			return "", fmt.Errorf("failed to encode stamp %d: %v", i, err)
		}
		imgTemp.Close()
		defer os.Remove(imgTemp.Name())

		// pdfcpu watermark description (Back to Bottom-Left origin)
		// pos:bl = Bottom-Left origin
		// off: x y = Offset from bottom-left (x=right, y=up)
		// scale: factor abs = Absolute scaling relative to native points
		scaleStr := fmt.Sprintf("%.4f abs", 1.0/qualityFactor)

		// Calculate final X and Y coordinates for pdfcpu (bottom-left origin)
		// stamp.X and stamp.Y are from top-left (browser coordinates)
		// pdfcpu's Y increases upwards from the bottom.
		// So, browser Y (top-down) needs to be converted to pdfcpu Y (bottom-up).
		// The total height of the placed image is finalH.
		// The browser Y coordinate (stamp.Y + offY) is the top edge of the placed image.
		// To get the bottom edge from the bottom of the PDF: pdfHeight - (browser_Y + placed_image_height)
		finalX := stamp.X + offX
		finalY := pdfHeight - (stamp.Y + offY + finalH)

		desc := fmt.Sprintf("pos:bl, off:%f %f, scale:%s, rot:0", finalX, finalY, scaleStr)

		// Process staving (no log)

		wm, err := api.ImageWatermark(imgTemp.Name(), desc, true, false, types.POINTS)
		if err != nil {
			return "", fmt.Errorf("failed to parse watermark %d details: %v", i, err)
		}

		selectedPages := []string{fmt.Sprintf("%d", stamp.PageNum)}
		err = api.AddWatermarksFile(currentInput, stepOutput, selectedPages, wm, nil)
		if err != nil {
			return "", fmt.Errorf("failed to add watermark %d: %v", i, err)
		}

		currentInput = stepOutput
	}

	return outputPath, nil
}

// UpdatePDFPages creates a new PDF with the specified sequence of pages from the source PDF
func (a *App) UpdatePDFPages(pdfPath string, pages []string) (string, error) {
	pdfPath = filepath.Clean(pdfPath)
	// Create a unique temp file name to avoid collisions
	tempDir := os.TempDir()
	outputPath := filepath.Join(tempDir, fmt.Sprintf("capgo_mod_%d_%s", os.Getpid(), filepath.Base(pdfPath)))

	// Ensure we don't overwrite if it somehow exists
	if _, err := os.Stat(outputPath); err == nil {
		os.Remove(outputPath)
	}

	err := api.CollectFile(pdfPath, outputPath, pages, nil)
	if err != nil {
		return "", fmt.Errorf("failed to collect pages: %v", err)
	}

	return outputPath, nil
}

// Release represents a GitHub release
type Release struct {
	TagName string  `json:"tag_name"`
	HtmlUrl string  `json:"html_url"`
	Body    string  `json:"body"`
	Assets  []Asset `json:"assets"`
}

type Asset struct {
	Name               string `json:"name"`
	BrowserDownloadUrl string `json:"browser_download_url"`
}

// UpdateResult contains the update check information
type UpdateResult struct {
	UpdateAvailable bool   `json:"updateAvailable"`
	LatestVersion   string `json:"latestVersion"`
	ReleaseUrl      string `json:"releaseUrl"`
	ReleaseNotes    string `json:"releaseNotes"`
	CurrentVersion  string `json:"currentVersion"`
	Error           string `json:"error,omitempty"`
	DownloadUrl     string `json:"downloadUrl"`
}

const CurrentAppVersion = "v1.0.5"

// CheckForUpdates checks the GitHub repo for a newer version
func (a *App) CheckForUpdates() UpdateResult {
	resp, err := http.Get("https://api.github.com/repos/lelehuy/CapGo/releases/latest")
	if err != nil {
		return UpdateResult{Error: fmt.Sprintf("Network error: %v", err), CurrentVersion: CurrentAppVersion}
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return UpdateResult{Error: "Failed to fetch release info", CurrentVersion: CurrentAppVersion}
	}

	var release Release
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return UpdateResult{Error: "Failed to parse release info", CurrentVersion: CurrentAppVersion}
	}

	// Simple version comparison (assumes tags are like "v1.0.4")
	// If the tags differ, we assume it's an update (or at least a difference)
	// For production, use a semver library.

	var downloadUrl string
	for _, asset := range release.Assets {
		if strings.HasSuffix(asset.Name, ".dmg") {
			downloadUrl = asset.BrowserDownloadUrl
			break
		}
	}

	if release.TagName != CurrentAppVersion {
		return UpdateResult{
			UpdateAvailable: true,
			LatestVersion:   release.TagName,
			ReleaseUrl:      release.HtmlUrl,
			ReleaseNotes:    release.Body,
			CurrentVersion:  CurrentAppVersion,
			DownloadUrl:     downloadUrl,
		}
	}

	return UpdateResult{
		UpdateAvailable: false,
		LatestVersion:   release.TagName,
		CurrentVersion:  CurrentAppVersion,
	}
}

// DownloadUpdate downloads the update file to the Downloads folder
func (a *App) DownloadUpdate(url string) (string, error) {
	resp, err := http.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}

	downloadPath := filepath.Join(homeDir, "Downloads", fmt.Sprintf("CapGo-Update-%d.dmg", os.Getpid()))
	out, err := os.Create(downloadPath)
	if err != nil {
		return "", err
	}
	defer out.Close()

	_, err = out.ReadFrom(resp.Body)
	if err != nil {
		return "", err
	}

	return downloadPath, nil
}

// InstallUpdate installs the update seamlessly
func (a *App) InstallUpdate(dmgPath string) error {
	exePath, err := os.Executable()
	if err != nil {
		return err
	}

	// Safety check: specific logic for macOS .app bundle
	// CapGo.app/Contents/MacOS/CapGo
	if !strings.Contains(exePath, ".app/Contents/MacOS") {
		return fmt.Errorf("developer mode detected: cannot auto-update binary outside of .app bundle")
	}

	appBundlePath := filepath.Dir(filepath.Dir(filepath.Dir(exePath))) // Path/to/CapGo.app

	// Create a shell script to handle the swap after this process quits
	scriptContent := fmt.Sprintf(`#!/bin/bash
PID=%d
DMG_PATH="%s"
DEST_APP="%s"
MOUNT_POINT="/tmp/CapGo_Update_Mnt_%d"

# 1. Wait for the main app to terminate
while kill -0 $PID 2>/dev/null; do sleep 0.5; done

# 2. Mount the DMG
mkdir -p "$MOUNT_POINT"
hdiutil attach "$DMG_PATH" -mountpoint "$MOUNT_POINT" -nobrowse -readonly

# 3. Swap the Application
SOURCE_APP="$MOUNT_POINT/CapGo.app"

if [ -d "$SOURCE_APP" ]; then
    echo "Replacing App..."
    rm -rf "$DEST_APP"
    cp -R "$SOURCE_APP" "$DEST_APP"
    
    # 3.5. Fix Permissions (Quarantine)
    xattr -cr "$DEST_APP"

    # 4. Relaunch
    open "$DEST_APP"
else
    echo "Update failed: App not found in DMG"
fi

# 5. Cleanup
hdiutil detach "$MOUNT_POINT" -force
rm -rf "$MOUNT_POINT"
`, os.Getpid(), dmgPath, appBundlePath, os.Getpid())

	scriptPath := filepath.Join(os.TempDir(), "capgo_updater.sh")
	if err := os.WriteFile(scriptPath, []byte(scriptContent), 0755); err != nil {
		return err
	}

	// Run the updater script detached
	cmd := exec.Command("sh", scriptPath)
	if err := cmd.Start(); err != nil {
		return err
	}

	// Quit the app immediately so the script can overwrite it
	runtime.Quit(a.ctx)
	return nil
}

// BrowserOpenURL opens a URL in the default browser
func (a *App) BrowserOpenURL(url string) {
	runtime.BrowserOpenURL(a.ctx, url)
}
