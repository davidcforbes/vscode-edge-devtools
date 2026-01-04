# Microsoft Edge Browser Viewer for Visual Studio Code

A lightweight browser preview extension for Visual Studio Code that lets you view and interact with web applications directly inside your editor using Microsoft Edge.

![Browser Viewer in Action](img/edge-for-vscode-context-walkthrough.gif)

## Features

* **Live Browser Preview** - View your web applications in a browser panel inside VS Code
* **Multiple Browser Instances** - Open and manage multiple browser windows simultaneously
* **Device Emulation** - Test your site with built-in device emulation toolbar
* **Instant Updates** - See changes instantly as you edit your code
* **Integrated Workflow** - No need to switch between your editor and external browser windows

## Requirements

This extension requires Microsoft Edge to be installed on your computer:
- **Windows**: Edge comes pre-installed
- **Mac/Linux**: [Download and install Microsoft Edge](https://www.microsoft.com/edge)

## Getting Started

### Installation

1. Install the extension from the VS Code Marketplace
2. Make sure Microsoft Edge is installed on your system
3. Open a workspace or folder in VS Code

### Basic Usage

**Open a Browser Window:**
- Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) to open the Command Palette
- Type "Edge" and select **"Microsoft Edge Tools: Launch Browser"**
- Enter the URL you want to view (e.g., `http://localhost:3000`)

**Work with Multiple Browsers:**
- Launch additional browser windows using **"Microsoft Edge Tools: New Browser Window"**
- Switch between browser instances with **"Microsoft Edge Tools: Switch to Browser"**
- View all open browsers with **"Microsoft Edge Tools: List Open Browsers"**
- Close the current browser with **"Microsoft Edge Tools: Close Current Browser"**

### Configuration

Access extension settings via File > Preferences > Settings, then search for "Edge Tools":

- **Browser Flavor**: Choose which version of Edge to use (stable, beta, dev, canary)
- **Hostname**: CDP endpoint hostname (default: localhost)
- **Port**: CDP endpoint port (default: 9222)
- **Headless**: Run browser in headless mode (default: false)
- **User Data Directory**: Custom user data directory for the browser session

## Use Cases

**Local Development**
- Preview your web app while you code
- Test responsive layouts with device emulation
- Keep your browser and code side-by-side

**Multi-Site Development**
- Work on multiple web applications simultaneously
- Compare different versions or branches
- Test cross-application interactions

**Quick Testing**
- Rapidly test changes without leaving VS Code
- Verify responsive behavior across device sizes
- Check how your site renders in Edge

## Documentation

For more details on configuration and advanced usage, visit the [official documentation](https://learn.microsoft.com/microsoft-edge/visual-studio-code/microsoft-edge-devtools-extension).

## Keyboard Shortcuts

The extension integrates seamlessly with VS Code's command palette. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) and type "Edge" to see all available commands.

## Troubleshooting

**Browser doesn't launch:**
- Verify Microsoft Edge is installed
- Check the "Browser Flavor" setting matches your installed version
- Ensure no other application is using port 9222 (or change the port in settings)

**Multiple instances not working:**
- Make sure you're using **"New Browser Window"** command, not launching repeatedly
- Check that all browser instances appear in **"List Open Browsers"**

## Contributing

This project welcomes contributions and suggestions. Most contributions require you to agree to a Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us the rights to use your contribution.

For details on contributing, see [CONTRIBUTING.md](https://github.com/Microsoft/vscode-edge-devtools/blob/main/CONTRIBUTING.md).

## Privacy & Telemetry

**Data Collection**: This extension collects usage data and telemetry to help improve the product. You can disable telemetry in VS Code settings. See the [VS Code telemetry documentation](https://code.visualstudio.com/docs/getstarted/telemetry) for instructions.

Microsoft's privacy statement is available at [https://go.microsoft.com/fwlink/?LinkID=824704](https://go.microsoft.com/fwlink/?LinkID=824704).

## Security

Security issues and bugs should be reported privately via email to the Microsoft Security Response Center (MSRC) at [secure@microsoft.com](mailto:secure@microsoft.com).

You should receive a response within 24 hours. For more information, visit the [Security TechCenter](https://technet.microsoft.com/security/default).

## License

This extension is licensed under the MIT License. See the LICENSE file for details.
