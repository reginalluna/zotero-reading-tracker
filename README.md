# Zotero Reading Progress Tracker

Zotero Reading Progress Tracker is a Zotero 9 plugin for recording reading status and PDF reading progress directly in the Zotero library.

## Features

* Adds a **Reading Status** column to the item table.
* Supports **To Read**, **Reading**, and **Done** statuses.
* Records the current page from an open PDF.
* Provides manual page entry when the page cannot be detected automatically.
* Works with bibliographic items, attachments, and annotations.
* Stores reading status as Zotero tags and page progress in the **Extra** field.

## Compatibility

* Zotero 9.0.x

## Installation

1. Open the [Releases](https://github.com/lunarMaxar/zotero-reading-progress/releases) page.
2. Download the latest `.xpi` file.
3. In Zotero, open **Tools → Plugins**.
4. Select the gear menu and choose **Install Plugin From File…**.
5. Select the downloaded `.xpi` file.
6. Open the item-table column picker and enable **Reading Status**.

## Usage

Right-click a library item, attachment, or annotation and open **Reading Progress**.

The menu provides commands to:

* set the status to **To Read**, **Reading**, or **Done**;
* clear the reading status;
* record the current PDF page;
* clear the recorded page.

When the corresponding PDF is open, the plugin records its current page automatically. Otherwise, it provides a manual page-entry prompt.

## Data Storage

Reading status is stored using the following Zotero tags:

* `#status:to-read`
* `#status:reading`
* `#status:done`

Page progress is stored in the parent item's **Extra** field:

```text
Reading Progress: Page 12/30
```

## Licence

This project is distributed under the [MIT License](LICENSE).

## Disclaimer

This is an independent Zotero plugin and is not affiliated with or endorsed by the Zotero project.
