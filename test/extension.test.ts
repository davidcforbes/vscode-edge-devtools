// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ExtensionContext, Uri} from "vscode";
import TelemetryReporter from "@vscode/extension-telemetry";
import { createFakeExtensionContext, createFakeTelemetryReporter, createFakeVSCode, createFakeLanguageClient, Mocked } from "./helpers/helpers";
import {
    buttonCode,
    IRemoteTargetJson,
    IRuntimeConfig,
    SETTINGS_STORE_NAME,
    SETTINGS_VIEW_NAME,
    type IUserConfig,
} from "../src/utils";

jest.mock("vscode", () => createFakeVSCode(), { virtual: true });
jest.mock("vscode-languageclient/node", () => createFakeLanguageClient(), { virtual: true });

describe("extension", () => {
    const fakeRuntimeConfig: Partial<IRuntimeConfig> = {};

    describe("activate", () => {
        let context: ExtensionContext;
        let commandMock: jest.Mock;
        let mockUtils: Partial<Mocked<typeof import("../src/utils")>>;

        beforeEach(() => {
            // Initialize a fake context
            context = createFakeExtensionContext();

            // Mock out the imported utils
            mockUtils = {
                buttonCode,
                SETTINGS_STORE_NAME,
                SETTINGS_VIEW_NAME,
                createTelemetryReporter: jest.fn((_: ExtensionContext) => createFakeTelemetryReporter()),
                getListOfTargets: jest.fn().mockReturnValue([]),
                getRemoteEndpointSettings: jest.fn(),
                getRuntimeConfig: jest.fn(),
                reportFileExtensionTypes: jest.fn(),
                reportChangedExtensionSetting: jest.fn(),
                reportExtensionSettings: jest.fn(),
            };
            jest.doMock("../src/utils", () => mockUtils);

            const mockLanguageClient = createFakeLanguageClient()
            jest.doMock("vscode-languageclient/node", () => mockLanguageClient, { virtual: true });

            // Mock out vscode command registration
            const mockVSCode = createFakeVSCode();
            commandMock = mockVSCode.commands.registerCommand;
            jest.doMock("vscode", () => mockVSCode, { virtual: true });
            jest.resetModules();
        });

        it("creates a telemetry reporter", async () => {
            const newExtension = await import("../src/extension");

            // Activation should create a new reporter
            newExtension.activate(context);
            expect(mockUtils.createTelemetryReporter).toHaveBeenCalled();
        });

        it("registers commands correctly", async () => {
            const newExtension = await import("../src/extension");

            // Activation should add the commands as subscriptions on the context
            newExtension.activate(context);

            // Extension now registers 8 commands
            expect(context.subscriptions.length).toBe(8);
            expect(commandMock).toHaveBeenCalledTimes(8);
            expect(commandMock)
                .toHaveBeenNthCalledWith(1, `${SETTINGS_STORE_NAME}.attach`, expect.any(Function));
            expect(commandMock)
                .toHaveBeenNthCalledWith(2, `${SETTINGS_STORE_NAME}.launch`, expect.any(Function));
            expect(commandMock)
                .toHaveBeenNthCalledWith(3, `${SETTINGS_VIEW_NAME}.launchHtml`, expect.any(Function));
            expect(commandMock)
                .toHaveBeenNthCalledWith(4, `${SETTINGS_VIEW_NAME}.launchScreencast`, expect.any(Function));
            expect(commandMock)
                .toHaveBeenNthCalledWith(5, `${SETTINGS_STORE_NAME}.newBrowserWindow`, expect.any(Function));
            expect(commandMock)
                .toHaveBeenNthCalledWith(6, `${SETTINGS_STORE_NAME}.listOpenBrowsers`, expect.any(Function));
            expect(commandMock)
                .toHaveBeenNthCalledWith(7, `${SETTINGS_STORE_NAME}.switchToBrowser`, expect.any(Function));
            expect(commandMock)
                .toHaveBeenNthCalledWith(8, `${SETTINGS_STORE_NAME}.closeCurrentBrowser`, expect.any(Function));
        });

        it("requests targets on attach command", async () => {
            // Store the attach command that will be subscribed by extension activation
            let attachCommand: (() => Promise<void>) | undefined;
            commandMock.mockImplementation((name, callback) => {
                if (name === `${SETTINGS_STORE_NAME}.attach`) {
                    attachCommand = callback;
                }
            });

            // Activate the extension
            const newExtension = await import("../src/extension");
            newExtension.activate(context);
            expect(attachCommand).toBeDefined();

            // Ensure that attaching will request targets
            mockUtils.getRemoteEndpointSettings!.mockResolvedValue({
                defaultUrl: "url",
                hostname: "localhost",
                port: 9222,
                timeout: 10000,
                useHttps: false,
                userDataDir: "profile",
            });
            mockUtils.getListOfTargets!.mockResolvedValue([]);
            attachCommand!();
            expect(mockUtils.getListOfTargets).toHaveBeenCalled();
        });

    });

    describe("attach", () => {
        let target: any;
        let mocks: {
            panel: any,
            utils: Partial<Mocked<typeof import("../src/utils")>>,
            vscode: any,
        };
        let mockTelemetry: Mocked<Readonly<TelemetryReporter>>;

        beforeEach(() => {
            target = {
                title: "title",
                url: "url",
                webSocketDebuggerUrl: "ws",
            } as IRemoteTargetJson;

            mockTelemetry = createFakeTelemetryReporter();

            mocks = {
                panel: {
                    ScreencastPanel: {
                        createOrShow: jest.fn(),
                    },
                },
                utils: {
                    createTelemetryReporter: jest.fn((_: ExtensionContext) => mockTelemetry),
                    fixRemoteWebSocket: jest.fn().mockReturnValue(target),
                    getListOfTargets: jest.fn().mockResolvedValue([target]),
                    getRemoteEndpointSettings: jest.fn().mockReturnValue({
                        hostname: "hostname",
                        port: "port",
                        timeout: 10000,
                        useHttps: false,
                    }),
                    getRuntimeConfig: jest.fn().mockReturnValue(fakeRuntimeConfig),
                },
                vscode: createFakeVSCode(),
            };

            jest.doMock("vscode", () => mocks.vscode, { virtual: true });
            jest.doMock("../src/screencastPanel", () => mocks.panel);
            jest.doMock("../src/utils", () => mocks.utils);
            jest.resetModules();
        });

        it("creates a telemetry reporter", async () => {
            const newExtension = await import("../src/extension");

            // Activation should create a new reporter
            await newExtension.attach(createFakeExtensionContext());
            expect(mocks.utils.createTelemetryReporter).toHaveBeenCalled();
        });

        it("uses user config", async () => {
            const newExtension = await import("../src/extension");

            // Activation should create a new reporter
            const config = {
                port: 9273,
                url: "something",
            };
            await newExtension.attach(createFakeExtensionContext(), "url", config);
            expect(mocks.utils.getRemoteEndpointSettings).toHaveBeenCalledWith(config);
        });

        it("calls fixRemoteWebSocket for all targets", async () => {
            const expectedCount = 5;
            const allTargets = [];
            for (let i = 0; i < expectedCount; i++) {
                allTargets.push(target);
            }

            mocks.utils.getListOfTargets!.mockResolvedValueOnce(allTargets);

            const newExtension = await import("../src/extension");
            await newExtension.attach(createFakeExtensionContext());
            expect(mocks.utils.fixRemoteWebSocket).toHaveBeenCalledTimes(expectedCount);
        });

        it("shows quick pick window if no target", async () => {
            const newExtension = await import("../src/extension");
            await newExtension.attach(createFakeExtensionContext());
            expect(mocks.vscode.window.showQuickPick).toHaveBeenCalledTimes(1);
        });

        it("opens devtools against quick pick target", async () => {
            const expectedPick = {
                detail: "http://target:9222",
            };
            mocks.vscode.window.showQuickPick.mockResolvedValueOnce(expectedPick);

            const expectedContext = createFakeExtensionContext();
            const newExtension = await import("../src/extension");
            await newExtension.attach(expectedContext);
            expect(mocks.panel.ScreencastPanel.createOrShow).toHaveBeenCalledWith(
                expectedContext,
                mockTelemetry,
                expectedPick.detail,
            );
        });

        it("opens devtools against given target", async () => {
            const expectedUrl = "http://target:9222";
            const expectedWS = "ws://target:9222";
            target = {
                title: "title",
                url: expectedUrl,
                webSocketDebuggerUrl: expectedWS,
            } as IRemoteTargetJson;

            mocks.utils.getListOfTargets!.mockResolvedValue([target]),
            mocks.utils.fixRemoteWebSocket!.mockReturnValueOnce(target);

            const expectedContext = createFakeExtensionContext();
            const newExtension = await import("../src/extension");
            await newExtension.attach(expectedContext, expectedUrl);
            expect(mocks.panel.ScreencastPanel.createOrShow).toHaveBeenCalledWith(
                expectedContext,
                mockTelemetry,
                expectedWS,
            );
        });

        it("opens devtools against given target with unmatched trailing slashes", async () => {
            const expectedUrl = "http://www.bing.com";
            const expectedWS = "ws://target:9222";
            target = {
                title: "title",
                url: `${expectedUrl}/`,
                webSocketDebuggerUrl: expectedWS,
            } as IRemoteTargetJson;

            mocks.utils.getListOfTargets!.mockResolvedValue([target]),
            mocks.utils.fixRemoteWebSocket!.mockReturnValueOnce(target);

            const expectedContext = createFakeExtensionContext();
            const newExtension = await import("../src/extension");
            await newExtension.attach(expectedContext, expectedUrl);
            expect(mocks.panel.ScreencastPanel.createOrShow).toHaveBeenCalledWith(
                expectedContext,
                mockTelemetry,
                expectedWS,
            );

            // Reverse the mismatched slashes
            target.url = expectedUrl;
            await newExtension.attach(expectedContext, `${expectedUrl}/`);
            expect(mocks.panel.ScreencastPanel.createOrShow).toHaveBeenCalledWith(
                expectedContext,
                mockTelemetry,
                expectedWS,
            );
        });

        it("opens devtools against given filter", async () => {
            const expectedUrl = "http://target:9222";
            const expectedWS = "ws://target:9222";
            target = {
                title: "title",
                url: expectedUrl,
                webSocketDebuggerUrl: expectedWS,
            } as IRemoteTargetJson;

            mocks.utils.getListOfTargets!.mockResolvedValue([target]),
            mocks.utils.fixRemoteWebSocket!.mockReturnValueOnce(target);

            const expectedContext = createFakeExtensionContext();
            const newExtension = await import("../src/extension");
            await newExtension.attach(expectedContext, "http://*");
            expect(mocks.panel.ScreencastPanel.createOrShow).toHaveBeenCalledWith(
                expectedContext,
                mockTelemetry,
                expectedWS,
            );
        });

        it("shows error if it can't find given target", async () => {
            const expectedMissingUrl = "some non-existent target";

            const newExtension = await import("../src/extension");
            await newExtension.attach(createFakeExtensionContext(), expectedMissingUrl);
            expect(mocks.vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining(expectedMissingUrl));
        });

        it("shows error if it can't find given target due to missing urls", async () => {
            const expectedUrl = target.url;
            delete target.url;

            const newExtension = await import("../src/extension");
            await newExtension.attach(createFakeExtensionContext(), expectedUrl);
            expect(mocks.vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining(expectedUrl));
        });

        it("reports telemetry if failed to get targets", async () => {
            mocks.utils.getListOfTargets!.mockResolvedValueOnce([]);

            const newExtension = await import("../src/extension");
            await newExtension.attach(createFakeExtensionContext());
            expect(mockTelemetry.sendTelemetryEvent).toHaveBeenCalled();
        });
    });

    describe("launch", () => {
        const fakeBrowser = {
            on: () => null,
            pages: jest.fn().mockResolvedValue([{
                target: () => ({
                    createCDPSession: () => ({
                        send: () => Promise.resolve({ targetInfo: {} })
                    })
                })
            }])
        };
        let mockReporter: Mocked<Readonly<TelemetryReporter>>;
        let mockUtils: Partial<Mocked<typeof import("../src/utils")>>;
        let mockPanel: Partial<Mocked<typeof import("../src/screencastPanel")>>;
        let mockVSCode: any;

        beforeEach(() => {
            mockReporter = createFakeTelemetryReporter();

            mockUtils = {
                createTelemetryReporter: jest.fn((_: ExtensionContext) => mockReporter),
                getBrowserPath: jest.fn().mockResolvedValue("path"),
                getListOfTargets: jest.fn().mockResolvedValue([]),
                getRemoteEndpointSettings: jest.fn().mockReturnValue({
                    hostname: "hostname",
                    port: "port",
                    timeout: 10000,
                    useHttps: false,
                    userDataDir: "profile"
                }),
                getRuntimeConfig: jest.fn().mockReturnValue(fakeRuntimeConfig),
                launchBrowser: jest.fn().mockResolvedValue(fakeBrowser),
                openNewTab: jest.fn().mockResolvedValue(null),
                buttonCode: { launch: '' },
                reportChangedExtensionSetting: jest.fn(),
                reportExtensionSettings: jest.fn(),
                reportUrlType: jest.fn(),
                reportFileExtensionTypes: jest.fn(),
            };

            mockPanel = {
                ScreencastPanel: {
                    createOrShow: jest.fn(),
                } as any,
            };
            mockVSCode = createFakeVSCode();

            jest.doMock("vscode", () => mockVSCode, { virtual: true });
            jest.doMock("../src/utils", () => mockUtils);
            jest.doMock("../src/screencastPanel", () => mockPanel);
            jest.resetModules();
        });


        it("can launch html files in remote (wsl) context", async () => {
            const expectedRemoteName = 'wsl';
            const testFileUri = {
                scheme: 'vscode-remote',
                authority: 'wsl+ubuntu-20.04',
                fsPath: 'test/path.html',
                query: '',
                fragment: ''
            } as Uri;

            mockVSCode.env.remoteName = expectedRemoteName;

            const expectedUrl = `file://${expectedRemoteName}.localhost/ubuntu-20.04/test/path.html`;

            const newExtension = await import("../src/extension");
            await newExtension.launchHtml(createFakeExtensionContext(), testFileUri);

            expect(mockUtils.getRemoteEndpointSettings).toHaveBeenCalled()
            expect(mockUtils.getBrowserPath).toHaveBeenCalled();
            expect(mockUtils.launchBrowser).toHaveBeenCalledWith(
                expect.any(String) /** browserPath */,
                expect.any(String) /** port */,
                expectedUrl /** targetUrl */,
                expect.any(String) /** userDataDir */,
                expect.any(Boolean) /** headlessOverride */
            );

        });

        it("can launch html files in non-remote contexts", async () => {
            mockVSCode.env.remoteName = undefined;
            const testFileUri = {
                scheme: 'file',
                authority: '',
                fsPath: 'test/path.html',
                query: '',
                fragment: ''
            } as Uri;

            const newExtension = await import("../src/extension");
            await newExtension.launchHtml(createFakeExtensionContext(), testFileUri);

        });

        it("calls launch on launch command with arguments", async () => {
            const vscode = jest.requireMock("vscode");

            // As we are overriding launch method we mock the extension.ts
            jest.mock("../src/extension");

            const args = { launchUrl: "http://example.com" };

            const context = createFakeExtensionContext();

            const newExtension = await import('../src/extension');

            // We mock the implementation for the launch function to validate it is able to being called with url
            // arguments
            jest.spyOn(newExtension, 'launch').mockImplementation((context: ExtensionContext, launchUrl ?: string, config ?: Partial<IUserConfig>)=> {
                expect(launchUrl).toEqual(args.launchUrl);
                return Promise.resolve();
            })

            // We mimic the call
            context.subscriptions.push(vscode.commands.registerCommand(`${SETTINGS_STORE_NAME}.launch`, ( opts: {launchUrl: string} = {launchUrl: ""} ): void => {
                void newExtension.launch(context, opts.launchUrl);
            }));

            const callback = vscode.commands.registerCommand.mock.calls[0][1];
            expect(callback).toBeDefined();

            await callback!(args);

            // Cleaning the mock after this test.
            jest.unmock("../src/extension");
        });

        it("calls launch on launch command", async () => {
            const vscode = jest.requireMock("vscode");
            const context = createFakeExtensionContext();

            // Activate the extension
            const newExtension = await import("../src/extension");
            newExtension.activate(context);

            // Get the launch command that was added by extension activation
            const callback = vscode.commands.registerCommand.mock.calls[1][1];
            expect(callback).toBeDefined();

            const result = await callback!(context);
            expect(result).toBeUndefined();
        });

        it("calls launch on launch view command", async () => {
            const vscode = jest.requireMock("vscode");
            const context = createFakeExtensionContext();

            // Activate the extension
            const newExtension = await import("../src/extension");
            newExtension.activate(context);

            // Get the launch command that was added by extension activation
            const callback = vscode.commands.registerCommand.mock.calls[2][1];
            expect(callback).toBeDefined();

            const result = await callback!(context);
            expect(result).toBeUndefined();
        });

        it("creates a telemetry reporter", async () => {
            const target = {
                webSocketDebuggerUrl: "ws://localhost:9222",
            };
            mockUtils.openNewTab!.mockResolvedValueOnce(target as any);
            const newExtension = await import("../src/extension");

            // Activation should create a new reporter
            await newExtension.launch(createFakeExtensionContext());
            expect(mockUtils.createTelemetryReporter).toHaveBeenCalled();
        });

        it("uses user config", async () => {
            const newExtension = await import("../src/extension");

            // Activation should create a new reporter
            const config = {
                port: 9273,
                url: "something",
            };
            await newExtension.launch(createFakeExtensionContext(), "url", config);
            expect(mockUtils.getRemoteEndpointSettings).toHaveBeenCalledWith(config);
        });

        it("shows the devtools against the target", async () => {
            const target = {
                webSocketDebuggerUrl: "ws://localhost:9222",
            };
            mockUtils.openNewTab!.mockResolvedValueOnce(target as any);
            const newExtension = await import("../src/extension");

            await newExtension.launch(createFakeExtensionContext());
            expect(mockPanel.ScreencastPanel!.createOrShow).toHaveBeenCalledWith(
                expect.any(Object),
                expect.any(Object),
                target.webSocketDebuggerUrl,
            );
        });

        it("shows the error with no browser path", async () => {
            mockUtils.getBrowserPath!.mockResolvedValueOnce("");

            const vscode = jest.requireMock("vscode");
            const newExtension = await import("../src/extension");

            const result = await newExtension.launch(createFakeExtensionContext());
            expect(result).toBeUndefined();
            expect(vscode.window.showErrorMessage).toHaveBeenCalled();
        });

        it("launches the browser", async () => {
            const target = {
                webSocketDebuggerUrl: "ws://localhost:9222",
            };
            mockUtils.openNewTab!.mockResolvedValueOnce(undefined);
            mockUtils.openNewTab!.mockResolvedValueOnce(target as any);
            const newExtension = await import("../src/extension");

            await newExtension.launch(createFakeExtensionContext());
            expect(mockUtils.launchBrowser).toHaveBeenCalled();
        });

        it("reports the browser type", async () => {
            mockUtils.openNewTab!.mockResolvedValue(undefined);
            const newExtension = await import("../src/extension");

            const tests = [
                { path: "some\\path\\to\\edge.exe -port", exe: "edge" },
                { path: "some\\path\\to\\msedge.exe -pii", exe: "edge" },
                { path: "some\\path\\to\\chrome.exe -hello", exe: "chrome" },
                { path: "some\\path\\to\\brave.exe", exe: "other" },
                { path: "a/mac/path/to/microsoft edge", exe: "edge" },
                { path: "a/mac/path/to/google chrome", exe: "chrome" },
                { path: "a/mac/path/to/some other browser", exe: "other" },
                { path: "some\\mixed/path\\to/a script.sh -some param", exe: "other" },
                { path: "some bad path that we will guess uses edge due to it containing that word", exe: "edge" },
            ];

            for (const t of tests) {
                (mockReporter.sendTelemetryEvent as jest.Mock).mockClear();
                mockUtils.getBrowserPath!.mockResolvedValueOnce(t.path);
                await newExtension.launch(createFakeExtensionContext());
                expect(mockReporter.sendTelemetryEvent).toHaveBeenNthCalledWith(
                    2,
                    "command/launch/browser",
                    expect.objectContaining({ exe: t.exe }),
                );
            }
        });
    });
});
