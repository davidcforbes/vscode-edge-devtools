
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { ErrorCodes } from './common/errorCodes';

const localize = nls.loadMessageBundle();

export interface ErrorEventInterface {
  title: string,
  message: string,
  errorCode: ErrorCodes
}

export class ErrorReporter {
  static async showErrorDialog(
    error: ErrorEventInterface): Promise<void> {

    // cannot do multiline due to:
    // https://github.com/Microsoft/vscode/issues/48900
    const checkSettings = localize('errorReporter.checkSettings', 'Check settings');
    const searchIssues = localize('errorReporter.searchIssues', 'Search issues');

    const answer = await vscode.window
      .showWarningMessage(
        `${error.title} ${error.message}`,
        ...[checkSettings, searchIssues],
      );

    if (answer === checkSettings) {
      void vscode.commands.executeCommand('workbench.action.openSettings', '@ext:ms-edgedevtools.vscode-edge-devtools');
    } else if (answer === searchIssues) {
      const searchUrl = `https://github.com/microsoft/vscode-edge-devtools/issues?q=is%3Aissue+is%3Aopen+${error.title}`;

      void vscode.env.openExternal(vscode.Uri.parse(searchUrl));
    }
  }

  static async showInformationDialog(
    error: ErrorEventInterface): Promise<void> {
    // cannot do multiline due to:
    // https://github.com/Microsoft/vscode/issues/48900
    await vscode.window.showInformationMessage(
      `${error.title} ${error.message}`,
    );
  }
}
