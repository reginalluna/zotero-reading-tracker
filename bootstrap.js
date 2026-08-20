// Zotero 7-10 compatibility
var menuId = 'zotero-reading-tracker-menu';
var columnDataKey = 'reading-status-column-v2';
var registeredColumnKey = null;

// Emoji rendered via code points to avoid encoding issues
const EMOJI = {
    READING: String.fromCodePoint(0x1F7E1),
    TO_READ: String.fromCodePoint(0x1F7E2),
    DONE:    String.fromCodePoint(0x1F534),
    PAGE:    String.fromCodePoint(0x1F4CD)
};

async function startup({ id, version, rootURI }) {
    registeredColumnKey = await Zotero.ItemTreeManager.registerColumn({
        dataKey: columnDataKey,
        label: 'Reading Status',
        pluginID: id,
        dataProvider: (item, dataKey) => {
            try {
                let mainItem = item;
                if (!item.isRegularItem() && item.parentID) {
                    mainItem = Zotero.Items.get(item.parentID);
                }
                if (!mainItem) return '';

                let tags = mainItem.getTags().map(t => t.tag.toLowerCase());
                let statusText = '';
                if (tags.includes('#status:reading')) {
                    statusText = `${EMOJI.READING} Reading`;
                } else if (tags.includes('#status:to-read')) {
                    statusText = `${EMOJI.TO_READ} To Read`;
                } else if (tags.includes('#status:done')) {
                    statusText = `${EMOJI.DONE} Done`;
                }

                let pageText = '';
                let extra = mainItem.getField('extra');
                if (extra) {
                    let match = extra.match(/Reading Progress:\s*Page\s*(\d+)(?:\/(\d+))?/i);
                    if (match) {
                        pageText = match[2]
                            ? `Page ${match[1]}/${match[2]}`
                            : `Page ${match[1]}`;
                    }
                }

                let displayParts = [];
                if (statusText) displayParts.push(statusText);
                if (pageText) displayParts.push(pageText);
                return displayParts.join('  |  ');
            } catch (e) {
                return '';
            }
        }
    });

    // startup() runs before Zotero's main UI is ready. Schedule one setup pass
    // instead of polling the DOM; onMainWindowLoad covers windows opened later.
    Zotero.uiReadyPromise.then(() => {
        if (!registeredColumnKey) return;
        for (let win of Zotero.getMainWindows()) {
            setupUI(win);
        }
        let pane = Zotero.getActiveZoteroPane();
        if (pane) pane.refresh();
    });
}

function onMainWindowLoad({ window }) {
    setupUI(window);
}

function onMainWindowUnload({ window }) {
    removeUI(window);
}

function shutdown() {
    for (let win of Zotero.getMainWindows()) {
        removeUI(win);
    }
    if (registeredColumnKey) {
        Zotero.ItemTreeManager.unregisterColumn(registeredColumnKey);
        registeredColumnKey = null;
    }
}

function install() {}
function uninstall() {}

function createXULElement(doc, tagName) {
    return doc.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', tagName);
}

function setupUI(win) {
    let doc = win.document;
    let contextMenu = doc.getElementById('zotero-itemmenu');
    if (!contextMenu || doc.getElementById(menuId)) return;

    let menuItem = createXULElement(doc, 'menu');
    menuItem.setAttribute('id', menuId);
    menuItem.setAttribute('label', 'Reading Status');

    let menupopup = createXULElement(doc, 'menupopup');
    menuItem.appendChild(menupopup);

    createMenuItem(doc, menupopup, `${EMOJI.TO_READ} Set: To Read`, () => setStatus('to-read'));
    createMenuItem(doc, menupopup, `${EMOJI.READING} Set: Reading`, () => setStatus('reading'));
    createMenuItem(doc, menupopup, `${EMOJI.DONE} Set: Done`, () => setStatus('done'));

    menupopup.appendChild(createXULElement(doc, 'menuseparator'));

    createMenuItem(doc, menupopup, `${EMOJI.PAGE} Record Page (Auto)`, () => recordProgressAuto());

    contextMenu.appendChild(menuItem);
}

function removeUI(win) {
    let menu = win.document.getElementById(menuId);
    if (menu) menu.remove();
}

function createMenuItem(doc, parent, label, action) {
    let item = createXULElement(doc, 'menuitem');
    item.setAttribute('label', label);
    item.addEventListener('command', action, false);
    parent.appendChild(item);
}

async function setStatus(status) {
    let pane = Zotero.getActiveZoteroPane();
    if (!pane) return;
    let items = pane.getSelectedItems();
    if (!items.length) return;

    let tagsToRemove = ['#status:to-read', '#status:reading', '#status:done'];
    let newTag = `#status:${status}`;

    await Zotero.DB.executeTransaction(async () => {
        for (let item of items) {
            let target = (!item.isRegularItem() && item.parentID) ? Zotero.Items.get(item.parentID) : item;
            for (let tag of tagsToRemove) {
                target.removeTag(tag);
            }
            target.addTag(newTag);
            await target.saveTx();
        }

        if (Zotero.UndoHistory && Zotero.UndoHistory.stageAction) {
            Zotero.UndoHistory.stageAction('undo-action-edit-metadata', { count: items.length });
        }
    });

    pane.refresh();
}

function findReaderForItems(targetIDs) {
    try {
        let win = Zotero.getMainWindow();
        if (win && win.Zotero_Tabs && win.Zotero_Tabs.selectedType === 'reader') {
            let tabID = win.Zotero_Tabs.selectedID;
            if (tabID) {
                let reader = Zotero.Reader.getByTabID(tabID);
                if (reader && targetIDs.has(reader.itemID)) {
                    return reader;
                }
            }
        }
    } catch (e) {}

    let readers = Zotero.Reader._readers || [];
    for (let reader of readers) {
        if (targetIDs.has(reader.itemID)) {
            return reader;
        }
    }
    return null;
}

function getReaderPageInfo(reader) {
    let currentPage = null;
    let totalPages = null;

    try {
        let stats = reader && reader._internalReader && reader._internalReader._state
            ? reader._internalReader._state.primaryViewStats
            : null;
        if (stats && typeof stats.pageIndex === 'number' && stats.pageIndex >= 0) {
            currentPage = stats.pageIndex + 1;
            totalPages = stats.pagesCount || null;
        }
    } catch (e) {}

    if (!currentPage) {
        try {
            let state = reader && reader.state;
            if (state && typeof state.pageIndex === 'number') {
                currentPage = state.pageIndex + 1;
                totalPages = state.numPages || null;
            }
        } catch (e) {}
    }

    return { currentPage, totalPages };
}

async function recordProgressAuto() {
    let pane = Zotero.getActiveZoteroPane();
    if (!pane) return;
    let win = pane.window || Zotero.getMainWindow();

    let items = pane.getSelectedItems();
    if (items.length !== 1) {
        win.alert("Please select exactly one item.");
        return;
    }
    let selectedItem = items[0];

    let targetIDs = new Set();
    if (selectedItem.isRegularItem()) {
        let attachmentIDs = selectedItem.getAttachments();
        for (let id of attachmentIDs) targetIDs.add(id);
    } else {
        targetIDs.add(selectedItem.id);
    }

    let foundReader = findReaderForItems(targetIDs);
    if (!foundReader) {
        win.alert("Cannot find open PDF. Please open the PDF file first.");
        return;
    }

    let { currentPage, totalPages } = getReaderPageInfo(foundReader);
    if (!currentPage) {
        win.alert("Could not read page number. Try scrolling the PDF.");
        return;
    }

    let targetItem = selectedItem;
    if (!selectedItem.isRegularItem() && selectedItem.parentID) {
        targetItem = Zotero.Items.get(selectedItem.parentID);
    }

    let pageStr = totalPages ? `Page ${currentPage}/${totalPages}` : `Page ${currentPage}`;
    let extra = targetItem.getField('extra');
    let newExtra = extra;
    let prefixPg = "Reading Progress: ";
    let regexPg = /Reading Progress:.*/;

    if (regexPg.test(newExtra)) {
        newExtra = newExtra.replace(regexPg, prefixPg + pageStr);
    } else {
        newExtra = newExtra ? `${newExtra}\n${prefixPg}${pageStr}` : `${prefixPg}${pageStr}`;
    }

    targetItem.setField('extra', newExtra);
    await targetItem.saveTx({
        undoAction: 'undo-action-edit-metadata',
        undoActionArgs: { count: 1 }
    });

    pane.refresh();
}
