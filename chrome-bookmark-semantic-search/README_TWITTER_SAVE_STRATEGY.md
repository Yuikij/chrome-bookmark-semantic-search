User proposal:
"First time scan -> flat bookmarks.
Later: 'Pin this category' and 'Sync to archive library' are merged into one operation: 'Save'. Clicking it saves the folder and bookmarks to the browser bookmarks.
Add 'Save All': saves all current folders and structured bookmarks to browser bookmarks.
Then adding/modifying folders' logic becomes smoother: it means modifying the browser bookmark folders (if you click save, otherwise it's discarded on refresh).
What do you think of this design?"

This makes a lot of sense! It's like a "Draft" workspace.
1. The raw extraction logic saves everything to the root `🐦 Twitter/X 书签/` folder, which is flat.
2. In the dashboard, the LLM does virtual clustering, and the user plays around with the folders (renaming, grouping) IN MEMORY.
3. Once they are happy, they click "Save" on a specific folder or "Save All".
4. *Only when they hit Save*, the script actually invokes `chrome.bookmarks.create` / `chrome.bookmarks.move` to translate the virtual draft into the real folder structure inside `🐦 Twitter/X 书签/`.
5. We safely deprecate the whole `twitterFolders` object store in IndexedDB because the real Chrome bookmarks *become* the persistent storage. Next time we open the extension or hit "Refresh", we just read the explicit folder structure directly from Chrome Bookmarks tree! If a tweet is inside a subfolder under `🐦 Twitter/X 书签/`, we respect that subfolder as the user's category.

This is a brilliant, clean, and totally stateless design.
