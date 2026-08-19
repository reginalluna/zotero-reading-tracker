# Zotero Reading Progress Tracker

A Zotero plugin for recording reading status and PDF reading progress directly in the Zotero library. Compatible with Zotero 7–10.

## Compatibility

- Zotero 7, 8, and 9
- Zotero 10.0.x
- Version 2.3.1 waits for Zotero's UI-ready signal, uses main-window lifecycle hooks, and avoids startup DOM polling.

## Features

* Adds a **Reading Status** column to the item table (enable it in the column picker).
* Supports **To Read**, **Reading**, and **Done** statuses via the right-click menu.
* Records the current page from an open PDF into the **Extra** field.
* Works with bibliographic items and their attachments.

## Installation

1. Open the [Releases](https://github.com/reginalluna/zotero-reading-tracker/releases) page.
2. Download the latest `.xpi` file.
3. In Zotero, open **Tools → Plugins**.
4. Select the gear menu and choose **Install Plugin From File…**.
5. Select the downloaded `.xpi` file.
6. Enable the **Reading Status** column in the item-table column picker.

## Release validation

Release builds check JavaScript syntax, validate the manifest and update feed, build the XPI, and test the archive before publication.

## Usage

Right-click a library item and choose **Reading Status** to set it to **To Read**, **Reading**, or **Done**. With the PDF open, choose **Record Page (Auto)** to save the current page.

## Data Storage

Reading status is stored as Zotero tags:

* `#status:to-read`
* `#status:reading`
* `#status:done`

Page progress is stored in the item's **Extra** field:

```text
Reading Progress: Page 12/30
```

## Licence

This project is distributed under the [MIT License](LICENSE).

## Disclaimer

This is an independent Zotero plugin and is not affiliated with or endorsed by the Zotero project.
