// Zotero 7-10 compatibility
var Services;
try {
    ({ Services } = ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs"));
} catch (e) {
    ({ Services } = ChromeUtils.import("resource://gre/modules/Services.jsm"));
}

var menuId = 'zotero-reading-tracker-menu';
var columnDataKey = 'reading-status-column-v2';
var registeredColumnKey = null;

// Emoji rendered via code points to avoid encoding issues
const EMOJI = {
    READING: String.fromCodePoint(0x1F7E1), // 🟡
    TO_READ: String.fromCodePoint(0x1F7E2), // 🟢
    DONE:    String.fromCodePoint(0x1F534), // 🔴
    PAGE:    String.fromCodePoint(0x1F4CD)  // 📍
};

async function startup({ id, version, rootURI }) {
    var win = Zotero.getMainWindow();
    if (win && win.ZoteroPane) {
        setupUI(win);
    }

    registeredColumnKey = await Zotero.ItemTreeManager.registerColumn({
        dataKey: columnDataKey,
        label: 'Reading Status',
        pluginID: id,
        dataProvider: (item, dataKey) => {
            try {
                // Resolve attachments/notes to their parent item
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

                // Read "Reading Progress: Page X/Y" from the Extra field
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
        },
        renderCell: function (index, data, column, isFirstColumn, doc) {
            // Zotero 7-10 calls renderCell(index, data, column, isFirstColumn, doc)
            let docEl = doc;
            // Legacy Zotero 6 signature fallback
            if (!docEl && column && column.tree && column.tree.window) {
                docEl = column.tree.window.document;
            }
            if (!docEl) docEl = Zotero.getMainWindow().document;

            let span = docEl.createElementNS("http://www.w3.org/1999/xhtml", "span");
            span.textContent = data;
            span.style.display = 'flex';
            span.style.alignItems = 'center';
            span.style.height = '100%';
            span.style.padding = '0 4px';
            span.style.color = 'inherit';
            return span;
        }
    });

    let pane = Zotero.getActiveZoteroPane();
    if (pane) pane.refresh();
}

function shutdown() {
    var win = Zotero.getMainWindow();
    if (win) {
        var menu = win.document.getElementById(menuId);
        if (menu) menu.remove();
    }
    if (registeredColumnKey) {
        Zotero.ItemTreeManager.unregisterColumn(registeredColumnKey);
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
    if (!contextMenu) return;
    if (doc.getElementById(menuId)) return;

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

        // Zotero 10 undo: batch the status change as one undo step (no-op on Zotero 7-9)
        if (Zotero.UndoHistory && Zotero.UndoHistory.stageAction) {
            Zotero.UndoHistory.stageAction('undo-action-edit-metadata', { count: items.length });
        }
    });

    pane.refresh();
}

// Find the reader showing any of the given item IDs
function findReaderForItems(targetIDs) {
    // Prefer the reader in the active tab
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

    // Fall back to scanning all open readers
    let readers = Zotero.Reader._readers || [];
    for (let reader of readers) {
        if (targetIDs.has(reader.itemID)) {
            return reader;
        }
    }
    return null;
}

// Current page and total pages from the open reader.
// Zotero 7+ dropped the public reader.state getter and Zotero.Reader.getByType(),
// so read view stats from the internal reader (stable across Zotero 7-10).
function getReaderPageInfo(reader) {
    let currentPage = null;
    let totalPages = null;

    try {
        let stats = reader && reader._internalReader && reader._internalReader._state
            ? reader._internalReader._state.primaryViewStats
            : null;
        if (stats && typeof stats.pageIndex === 'number' && stats.pageIndex >= 0) {
            currentPage = stats.pageIndex + 1; // pageIndex is 0-based
            totalPages = stats.pagesCount || null;
        }
    } catch (e) {}

    // Legacy Zotero 6 fallback
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
    // Zotero 10 undo; ignored by Zotero 7-9
    await targetItem.saveTx({
        undoAction: 'undo-action-edit-metadata',
        undoActionArgs: { count: 1 }
    });

    pane.refresh();
}
