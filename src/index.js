const MERGE_STRATEGY_SQUASH = "Squash";
const MERGE_STRATEGY_MERGE_COMMIT = "Merge commit";
const MERGE_STRATEGY_FAST_FORWARD = "Fast forward";

const state = {
    reset() {
        this.mergeDialogOpen = false;
        this.commitMessageChangedByUser = false;
        this.disableCommitMessageChangeTracking = false;
    }
};
state.reset();

const isLoggingEnabled = false;
function log(message) {
    if (isLoggingEnabled) {
        console.log(message);
    }
}

init();

async function init() {
    try {
        const mergeButton = await findMergeButton({ maxSecondsToWait: 10 });
        await attachMergeDialogOpenEventHandler(mergeButton);
        attachMergeDialogCloseEventHandler();
        attachMergeStrategyChangeEventHandler();
        attachCommitMessageChangedByUserEventHandler();
        watchForMergeButtonDomReplacement(mergeButton);
    } catch (error) {
        console.error(`Unable to initialize BitBucket PR Commit Message extension: ${error}`);
    }
}

async function attachMergeDialogOpenEventHandler(mergeButton) {
    const onMergeDialogOpen = () => {
        state.reset();
        updateMergeCommitMessage(getMergeStrategy());
        state.mergeDialogOpen = true;
    };

    mergeButton.addEventListener("click", async () => {
        try {
            await waitForMergeDialog({ maxSecondsToWait: 10 });
            onMergeDialogOpen();
        } catch (error) {
            console.error(`Unable to update commit message: ${error}`);
        }
    });
}

function attachMergeDialogCloseEventHandler() {
    setInterval(() => {
        if (state.mergeDialogOpen && !isMergeDialogShowing()) {
            state.mergeDialogOpen = false;
        }
    }, 100);
}

function attachMergeStrategyChangeEventHandler() {
    onMergeStrategyChange((newMergeStrategy) => {
        log(`Merge strategy changed to ${newMergeStrategy}`);
        updateMergeCommitMessage(newMergeStrategy);
    });
}

function attachCommitMessageChangedByUserEventHandler() {
    let isEventHandlerAttached = false;

    const textAreaInputHandler = () => {
        if (!state.disableCommitMessageChangeTracking) {
            log("Commit message input fired");
            state.commitMessageChangedByUser = true;
        }
    };

    setInterval(() => {
        if (state.mergeDialogOpen) {
            if (!isEventHandlerAttached) {
                const commitMessageTextArea = getMergeCommitMessageTextArea();
                if (commitMessageTextArea) {
                    commitMessageTextArea.addEventListener("input", textAreaInputHandler);
                    isEventHandlerAttached = true;
                }
            }
        } else {
            isEventHandlerAttached = false;
        }
    }, 100);
}

async function watchForMergeButtonDomReplacement(mergeButton) {
    let currentMergeButton = mergeButton;
    setInterval(async () => {
        const mergeButton = await findMergeButton({ maxSecondsToWait: 10 });
        if (currentMergeButton !== mergeButton) {
            log("Merge button has been replaced in the DOM");
            currentMergeButton = mergeButton;
            attachMergeDialogOpenEventHandler(mergeButton);
        }
    }, 1000);
}

function onMergeStrategyChange(handler) {
    let currentMergeStrategy;
    setInterval(() => {
        if (state.mergeDialogOpen) {
            const mergeStrategy = getMergeStrategy();
            if (mergeStrategy !== currentMergeStrategy) {
                currentMergeStrategy = mergeStrategy;
                handler(currentMergeStrategy);
            }
        }
    }, 100);
}

function findMergeButton({ maxSecondsToWait }) {
    const intervalInMilliseconds = 100;
    let millisecondsWaited = 0;

    const findButton = () => {
        const candidates = document.querySelectorAll("header button");
        const mergeButtons = [...candidates].filter(button => {
            const text = button.textContent.trim();
            return text === "Merge";
        });
        if (mergeButtons.length > 0) {
            return mergeButtons[0];
        }
    };

    const wait = (resolve, reject) => {
        setTimeout(() => {
            const button = findButton();

            if (button) {
                return resolve(button);
            }
            if (millisecondsWaited < (maxSecondsToWait * 1000)) {
                millisecondsWaited += intervalInMilliseconds;
                return wait(resolve, reject);
            }
            reject("Merge button not found");
        }, intervalInMilliseconds);
    };

    return new Promise((resolve, reject) => {
        wait(resolve, reject);
    });
}

function waitForMergeDialog({ maxSecondsToWait }) {
    const intervalInMilliseconds = 100;
    let millisecondsWaited = 0;

    const wait = (resolve, reject) => {
        setTimeout(() => {
            if (isMergeDialogShowing()) {
                return resolve(true);
            }
            if (millisecondsWaited >= (maxSecondsToWait * 1000)) {
                return reject("Timed out waiting for merge dialog to appear");
            }

            millisecondsWaited += intervalInMilliseconds;
            wait(resolve, reject);
        }, intervalInMilliseconds);
    };

    return new Promise((resolve, reject) => {
        wait(resolve, reject);
    });
}

function updateMergeCommitMessage(mergeStrategy) {
    if (state.commitMessageChangedByUser) {
        return;
    }

    log(`Updating merge commit message with strategy ${mergeStrategy}`);

    const commitMessageTextArea = getMergeCommitMessageTextArea();
    const defaultCommitMessage = commitMessageTextArea.value;
    const newCommitMessage = buildBetterCommitMessage(mergeStrategy, defaultCommitMessage);

    // Have to focus first or BitBucket will replace the new commit message with
    // the old one when user focuses the textarea
    commitMessageTextArea.focus();

    commitMessageTextArea.value = newCommitMessage;

    // Commit message will be reverted unless we signal via DOM events that the
    // textarea contents have changed
    sendDOMEventsSignalingTextChange(commitMessageTextArea);

    // Move text cursor to beginning
    commitMessageTextArea.setSelectionRange(0, 0);
}

function getMergeCommitMessageTextArea() {
    const oldCommitMessageTextAreaId = "id_commit_message";
    const newCommitMessageTextAreaId = "merge-dialog-commit-message-textfield";
    const textarea = document.querySelector(`#${oldCommitMessageTextAreaId},#${newCommitMessageTextAreaId}`);
    if (!textarea) {
        throw new Error("Unable to find merge commit message text area");
    }
    return textarea;
}

function sendDOMEventsSignalingTextChange(commitMessageTextArea) {
    dispatchKeyPressEvent(commitMessageTextArea, " ", "Space", 32);

    disableCommitMessageChangeTrackingWhile(() => {
        const inputEvent = new InputEvent("input", {
            bubbles: true,
            cancelable: true
        });
        const changeEvent = new UIEvent("change", {
            bubbles: true,
            cancelable: true
        });
        commitMessageTextArea.dispatchEvent(inputEvent);
        commitMessageTextArea.dispatchEvent(changeEvent);
    });
}

function disableCommitMessageChangeTrackingWhile(callback) {
    state.disableCommitMessageChangeTracking = true;
    callback();
    state.disableCommitMessageChangeTracking = false;
}

function dispatchKeyPressEvent(element, key, code, keyCode) {
    log(`Dispatching ${code}`);
    dispatchKeyboardEvent(element, "keydown", key, code, keyCode);
    dispatchKeyboardEvent(element, "keypress", key, code, keyCode);
    dispatchKeyboardEvent(element, "keyup", key, code, keyCode);
}

function dispatchKeyboardEvent(element, eventName, key, code, keyCode) {
    const keyboardEvent = new KeyboardEvent(eventName, {
        key,
        keyCode,
        code,
        charCode: keyCode,
        which: keyCode,
        bubbles: true,
        cancelable: true
    });
    element.dispatchEvent(keyboardEvent);
}

function buildBetterCommitMessage(mergeStrategy, defaultCommitMessage) {
    switch (mergeStrategy) {
        case MERGE_STRATEGY_SQUASH:
            return buildBetterSquashCommitMessage(defaultCommitMessage);
        case MERGE_STRATEGY_FAST_FORWARD:
            return "";
        case MERGE_STRATEGY_MERGE_COMMIT:
        default:
            return buildBetterDefaultCommitMessage(defaultCommitMessage);
    }
}

function buildBetterSquashCommitMessage(defaultCommitMessage) {
    const pullRequestNumber = getPullRequestNumber();
    const pullRequestTitle = getPullRequestTitle();
    let betterMessage = `${pullRequestTitle} (PR #${pullRequestNumber})`;

    const pullRequestDescription = getPullRequestDescription();
    if (pullRequestDescription) {
        betterMessage += `\n\n${pullRequestDescription}`;
    }

    const indivualCommitMessages = getIndividualCommitMessagesFromDefaultCommitMessage(defaultCommitMessage, pullRequestTitle);
    if (indivualCommitMessages) {
        betterMessage += `\n\n${indivualCommitMessages}`;
    }

    const approvals = getApprovalsFromDefaultCommitMessage(defaultCommitMessage);
    if (approvals) {
        betterMessage += `\n\n${approvals}`;
    }

    return betterMessage;
}

function buildBetterDefaultCommitMessage(defaultCommitMessage) {
    const pullRequestNumber = getPullRequestNumber();
    const pullRequestTitle = getPullRequestTitle();
    let betterMessage = `Merge: ${pullRequestTitle} (PR #${pullRequestNumber})`;

    const pullRequestDescription = getPullRequestDescription();
    if (pullRequestDescription) {
        betterMessage += `\n\n${pullRequestDescription}`;
    }

    const approvals = getApprovalsFromDefaultCommitMessage(defaultCommitMessage);
    if (approvals) {
        betterMessage += `\n\n${approvals}`;
    }

    return betterMessage;
}

function isMergeDialogShowing() {
    try {
        const possibleSelectors = [
            "#bb-fulfill-pullrequest-dialog h2",
            "[role='dialog'] header h4",
            "[role='dialog'] h1"
        ];
        const possibleDialogHeaders = document.querySelectorAll(possibleSelectors.join(","));
        return [...possibleDialogHeaders].some(header => header.textContent.trim() === "Merge pull request");
    } catch (error) {
        console.error(`Error while checking to see if merge dialog is showing: ${error}`);
        return false;
    }
}

function getPullRequestNumber() {
    const url = document.location.href;
    const match = /\/pull-requests\/([0-9]+)/.exec(url);
    if (!match) {
        throw new Error("Unable to determine pull request number");
    }
    return match[1];
}

function getPullRequestTitle() {
    const titleElement = document.querySelector("header h1");
    if (!titleElement) {
        throw new Error("Unable to find title element");
    }
    return titleElement.textContent.trim();
}

function getPullRequestDescription() {
    const descriptionElement = document.querySelector("#pull-request-description-panel p");
    if (!descriptionElement) {
        return null;
    }
    return descriptionElement.textContent.trim();
}

function getMergeStrategy() {
    const getMergeStrategyInOldPRInterface = () => {
        const chosenStrategyElement = document.querySelector("#id_merge_strategy_group .select2-chosen");
        if (chosenStrategyElement) {
            return chosenStrategyElement.textContent.trim();
        }
    };
    const getMergeStrategyInNewPRInterface = () => {
        const mergeStrategyInput = document.getElementById('merge-strategy');
        if (mergeStrategyInput) {
            return mergeStrategyInput.parentElement.textContent.trim();
        }
    };
    return getMergeStrategyInOldPRInterface() || getMergeStrategyInNewPRInterface();
}

function getIndividualCommitMessagesFromDefaultCommitMessage(defaultCommitMessage, pullRequestTitle) {
    const lines = getDefaultCommitMessageLines(defaultCommitMessage);
    return lines
        .filter(line => line.startsWith("* ") && line.substr(2).trim() !== pullRequestTitle)
        .join("\n");
}

function getApprovalsFromDefaultCommitMessage(defaultCommitMessage) {
    const lines = getDefaultCommitMessageLines(defaultCommitMessage);
    const approvalLines = lines.filter(line => line.startsWith("Approved-by: "));
    return approvalLines.join("\n");
}

function getDefaultCommitMessageLines(defaultCommitMessage) {
    return defaultCommitMessage.replace(/[\r\n]+/g, "\n").split("\n").map(line => line.trim());
}
