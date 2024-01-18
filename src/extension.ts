// The module 'vscode' contains the VS Code extensibility API
import * as vscode from 'vscode';
// The module 'fs' contains the Node JS File System API
import * as fs from 'node:fs';
// import path
import * as path from 'node:path';

/**
 * Activates the extension.
 *
 * @param {vscode.ExtensionContext} context - The context of the extension.
 * @return {void} This function does not return anything.
 */
export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand(
    'laravel-localize-tool.localize',
    async () => {
      const configs = vscode.workspace.getConfiguration('laravel-localize-tool');
      const wsPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
      const editor = vscode.window.activeTextEditor;

      if (editor) {
        const document = editor.document;
        const selection = editor.selection;
        const selectedText = document.getText(selection);

        if (selectedText) {
          const wordKey = await getKeyInputFromUser(selectedText);
          const wordTrans = await getArrayValueInputFromUser();
          const targetPath = prepareFileDir(wsPath, configs.get('targetPath'));
          const originalPath = prepareFileDir(wsPath, configs.get('originalPath'));

          if (!wordTrans) {
            vscode.window.showInformationMessage('Translation not given!');
          } else {
            let is_translated_flag = false;
            let fileContent = readFileContent(originalPath);
            if (keyExists(fileContent, wordKey)) {
              vscode.window.showInformationMessage(
                'Translation already exist on original!'
              );
            } else {
              is_translated_flag = true;
              addNewTranslation(
                fileContent,
                originalPath,
                wordKey,
                cleanText(selectedText)
              );
            }

            fileContent = readFileContent(targetPath);
            if (keyExists(fileContent, wordKey)) {
              vscode.window.showInformationMessage(
                'Translation already exist on target!'
              );
            } else {
              is_translated_flag = true;
              addNewTranslation(fileContent, targetPath, wordKey, wordTrans);
            }

            if (is_translated_flag) {
              vscode.window.showInformationMessage('Translation Added!');
            }

            // replace text with the directive @lang()
            const directive = getLocalizationDirective(wordKey);
            editor.edit((editBuilder) => {
              editBuilder.replace(selection, directive);
            });
            const saved = await document.save();

            if (!saved) {
              vscode.window.showInformationMessage("couldn't save localize.php file.");
            }
          }
        } else {
          vscode.window.showInformationMessage('No Text Selected!');
        }
      }
    }
  );

  context.subscriptions.push(disposable);
}

/**
 * Converts a given text to snake case.
 *
 * @param {string} text - The text to be converted.
 * @return {string} The converted text in snake case.
 */
function toSnakeCase(text: string) {
  return text.replace(/\s+/g, '_').toLowerCase();
}

function cleanText(text: string) {
  return text.replace(/['"`]/g, '');
}

/**
 * Retrieves a key input from the user for translation purposes.
 *
 * @param {string} selectedText - The word to be converted to snake case.
 * @return {Promise<string | undefined>} The translation key entered by the user, or undefined if no input was provided.
 */
async function getKeyInputFromUser(selectedText: string): Promise<string | undefined> {
  const wordKey = toSnakeCase(cleanText(selectedText));

  const result = await vscode.window.showInputBox({
    value: wordKey,
    placeHolder: 'Target Translation Key',
    ignoreFocusOut: true,
    validateInput: (text) => {
      return text.trim() ? null : 'Key is required !';
    },
  });

  return result;
}

/**
 * Retrieves an array value input from the user.
 *
 * @return {Promise<string | undefined>} The target translation value input by the user, or undefined if no value is provided.
 */
async function getArrayValueInputFromUser(): Promise<string | undefined> {
  const result = await vscode.window.showInputBox({
    value: '',
    placeHolder: 'Target Translation Value, ex: مرحبا',
    ignoreFocusOut: true,
    validateInput: (text) => {
      return text ? null : 'array value is required !';
    },
  });

  return result;
}

/**
 * Prepares the file directory for the given workspace path and language folder.
 *
 * @param {string | undefined} wsPath - The workspace path.
 * @param {string} languagePathFolder - The language folder.
 * @return {string} The localized file path.
 */
function prepareFileDir(wsPath: string | undefined, languagePathFolder?: string): string {
  const configs = vscode.workspace.getConfiguration('laravel-localize-tool');
  const relativePath = wsPath + `` + languagePathFolder;
  let localizeFilePath = relativePath + `${configs.get('targetFileName')}.php`;
  localizeFilePath = path.normalize(localizeFilePath);

  try {
    fs.mkdirSync(relativePath, { recursive: true });
    fs.openSync(localizeFilePath, 'a');

    return localizeFilePath;
  } catch (e: any) {
    vscode.window.showErrorMessage("couldn't create new directory !");
    vscode.window.showErrorMessage(e.message);

    throw e;
  }
}

/**
 * Reads the content of a file and returns it as an array of strings.
 *
 * @param {string} localizeFilePath - The path of the file to read.
 * @return {Array<string>} The content of the file as an array of strings.
 */
function readFileContent(localizeFilePath: string): Array<string> {
  try {
    let resourceContent = fs.readFileSync(localizeFilePath, 'utf8');

    if (!resourceContent || !validLangFile(resourceContent)) {
      resourceContent = '<?php\n\n return [ \n];';
    }

    const arrayContent = resourceContent
      .substring(resourceContent.indexOf('[') + 1, resourceContent.lastIndexOf(']'))
      .split(',');

    return arrayContent;
  } catch (e: any) {
    vscode.window.showErrorMessage("couldn't read file content");
    vscode.window.showErrorMessage(e.message);

    throw e;
  }
}

/**
 * Adds a new translation to the given content and writes it to the localize file path.
 *
 * @param {Array<string>} content - The original content of the localize file.
 * @param {string} localizeFilePath - The path to the localize file.
 * @param {string | undefined} wordKey - The key of the word to be translated.
 * @param {string} wordTrans - The translated word.
 * @return {boolean} Returns `true` if the translation was added and written successfully, `false` otherwise.
 */
function addNewTranslation(
  content: Array<string>,
  localizeFilePath: string,
  wordKey: string | undefined,
  wordTrans: string
): boolean {
  const result = content + `\t'${wordKey}' => '${wordTrans}',`;

  try {
    fs.writeFileSync(localizeFilePath, '<?php\n\n return [' + result + '\n];');

    return true;
  } catch (e: any) {
    vscode.window.showErrorMessage("couldn't write file content !");
    vscode.window.showErrorMessage(e.message);

    return false;
  }
}

/**
 * Retrieves the localization directive for the given word key.
 *
 * @param {string | undefined} wordKey - The key of the word to be localized.
 * @return {string} The localization directive.
 */
function getLocalizationDirective(wordKey: string | undefined): string {
  const currentFileType = vscode.window.activeTextEditor?.document.languageId;
  const configs = vscode.workspace.getConfiguration('laravel-localize-tool');
  let parentKey = configs.get('targetFileName');
  parentKey = String(parentKey).toLowerCase();

  if (currentFileType === 'blade') {
    return `{{ __('${parentKey}.${wordKey}') }}`;
  }

  return `__('${parentKey}.${wordKey}')`;
}

/**
 * Checks if a given key exists in an array.
 *
 * @param {Array<string>} array - The array to search for the key.
 * @param {string} [key=''] - The key to search for in the array.
 * @returns {boolean} - Returns true if the key exists in the array, otherwise returns false.
 */
function keyExists(array: Array<string>, key: string = ''): boolean {
  if (key && array.find((k) => k.includes(`'${key}'`))) {
    vscode.window.showInformationMessage(`'${key}' already exists !`);

    return true;
  }

  return false;
}

/**
 * Checks if the given content is a valid language file.
 *
 * @param {string} content - The content of the file.
 * @return {boolean} Returns true if the content is a valid language file, false otherwise.
 */
function validLangFile(content: string): boolean {
  if (content) {
    let valid =
      content.includes('<?php') && content.includes('return [') && content.includes(']');

    if (valid) {
      return true;
    }
  }

  return false;
}

export function deactivate() {}
