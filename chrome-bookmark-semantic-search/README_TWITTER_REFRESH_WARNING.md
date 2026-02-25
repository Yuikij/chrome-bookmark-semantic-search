The user feedback is highly relevant: "there are two data sources for the Twitter bookmarks right now: the browser's bookmark list and the user settings (IndexedDB)". 
The system stores user-defined folders for Twitter in IndexedDB (`userFolders` mapping folderName -> array of bookmark IDs). But the raw bookmarks themselves live in Chrome Bookmarks (all with `[X推文]` tags).
The problem is that if a bookmark gets deleted or moved in Chrome, the `userFolders` inside IndexedDB may keep an orphan ID, or if new bookmarks are added they won't automatically join existing structures unless re-clustered.
Also, the UI is complex and weirdly splits `userFolders` and `autoClusters` without a clean single source of truth.
Right now I just need to acknowledge the user's feedback, agree with it, and state that we will implement a unified synchronization approach later (e.g. merging DB folders with Chrome bookmarks, or making the UI reflect a merged view).
