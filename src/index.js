const MERGE_STRATEGY_SQUASH = "Squash";
const MERGE_STRATEGY_MERGE_COMMIT = "Merge commit";
const MERGE_STRATEGY_FAST_FORWARD = "Fast forward";

const state = {};
state.reset = () => {
    state.mergeDialogOpen = false;
    state.commitMessageChangedByUser = false;
};
state.reset();

init();

async function init() {
    try {
        await attachMergeDialogOpenEventHandler();
        attachMergeDialogCloseEventHandler();
        attachMergeStrategyChangeEventHandler();
        attachCommitMessageChangedByUserEventHandler();
    } catch (error) {
        console.error(`Unable to initialize BitBucket PR Commit Message extension: ${error}`);
    }
}

async function attachMergeDialogOpenEventHandler() {
    const onMergeDialogOpen = () => {
        state.reset();
        state.mergeDialogOpen = true;
        updateMergeCommitMessage(getMergeStrategy());
    };

    const mergeButton = await findMergeButton({ maxSecondsToWait: 10 });
    mergeButton.addEventListener("click", async () => {
        try {
            await waitForMergeDialog({ maxSecondsToWait: 10 });
            onMergeDialogOpen();
        } catch (error) {
            console.error(`Unabled to update commit message: ${error}`);
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
        updateMergeCommitMessage(newMergeStrategy);
    });
}

function attachCommitMessageChangedByUserEventHandler() {
    let isEventHandlerAttached = false;

    const handler = () => {
        state.commitMessageChangedByUser = true;
    };

    setInterval(() => {
        if (state.mergeDialogOpen) {
            if (!isEventHandlerAttached) {
                const commitMessageTextArea = document.getElementById("merge-dialog-commit-message-textfield");
                commitMessageTextArea.addEventListener("keypress", handler);
                isEventHandlerAttached = true;
            }
        } else {
            isEventHandlerAttached = false;
        }
    }, 100);
}

function onMergeStrategyChange(handler) {
    let currentMergeStrategy;
    setInterval(() => {
        const mergeStrategy = getMergeStrategy();
        if (mergeStrategy !== currentMergeStrategy) {
            currentMergeStrategy = mergeStrategy;
            handler(currentMergeStrategy);
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

    const oldCommitMessageTextAreaId = "id_commit_message";
    const newCommitMessageTextAreaId = "merge-dialog-commit-message-textfield";
    const commitMessageTextArea = document.querySelector(`#${oldCommitMessageTextAreaId},#${newCommitMessageTextAreaId}`);
    const defaultCommitMessage = commitMessageTextArea.value;
    const newCommitMessage = buildBetterCommitMessage(mergeStrategy, defaultCommitMessage);

    // Have to focus first or BitBucket will replace the new commit message with
    // the old one when user focuses the textarea
    commitMessageTextArea.focus();

    commitMessageTextArea.value = newCommitMessage;

    // Move text cursor to beginning
    commitMessageTextArea.setSelectionRange(0, 0);
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

    const indivualCommitMessages = getIndividualCommitMessagesFromDefaultCommitMessage(defaultCommitMessage);
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

    const indivualCommitMessages = getIndividualCommitMessagesFromDefaultCommitMessage(defaultCommitMessage);
    if (indivualCommitMessages) {
        betterMessage += `\n\n${indivualCommitMessages}`;
    }

    const approvals = getApprovalsFromDefaultCommitMessage(defaultCommitMessage);
    if (approvals) {
        betterMessage += `\n\n${approvals}`;
    }

    return betterMessage;
}

function isMergeDialogShowing() {
    try {
        const oldSelector = "#bb-fulfill-pullrequest-dialog h2";
        const newSelector = "div[role='dialog'] header h4";
        const possibleDialogHeaders = document.querySelectorAll(`${oldSelector},${newSelector}`);
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
    return document.querySelector("header h1").textContent.trim();
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

function getIndividualCommitMessagesFromDefaultCommitMessage(defaultCommitMessage) {
    const lines = getDefaultCommitMessageLines(defaultCommitMessage);
    const commitLines = lines.filter(line => line.startsWith("* "));
    return commitLines.join("\n");
}

function getApprovalsFromDefaultCommitMessage(defaultCommitMessage) {
    const lines = getDefaultCommitMessageLines(defaultCommitMessage);
    const approvalLines = lines.filter(line => line.startsWith("Approved-by: "));
    return approvalLines.join("\n");
}

function getDefaultCommitMessageLines(defaultCommitMessage) {
    return defaultCommitMessage.replace(/[\r\n]+/g, "\n").split("\n");
}
