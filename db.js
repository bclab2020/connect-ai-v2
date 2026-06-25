/**
 * CONNECT AI - IndexedDB Database Manager
 * Handles local session persistence for posture logs, joint coordinates, and sway metadata.
 */

var dbManager = {
    dbName: "ConnectAIDB",
    storeName: "sessions",
    db: null,

    /**
     * Initializes the IndexedDB database.
     * @returns {Promise<void>}
     */
    init: function() {
        return new Promise((resolve, reject) => {
            var request = indexedDB.open(this.dbName, 1);
            
            request.onupgradeneeded = function(event) {
                var db = event.target.result;
                if (!db.objectStoreNames.contains(dbManager.storeName)) {
                    db.createObjectStore(dbManager.storeName, { keyPath: "id" });
                }
            };

            request.onsuccess = function(event) {
                dbManager.db = event.target.result;
                resolve();
            };

            request.onerror = function(event) {
                reject("IndexedDB error: " + event.target.errorCode);
            };
        });
    },

    /**
     * Saves or updates a session in the database.
     * @param {Object} sessionData - Session object to persist.
     * @returns {Promise<void>}
     */
    saveSession: function(sessionData) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject("Database not initialized");
                return;
            }
            var transaction = this.db.transaction([this.storeName], "readwrite");
            var store = transaction.objectStore(this.storeName);
            var request = store.put(sessionData);

            request.onsuccess = function() {
                resolve();
            };

            request.onerror = function(e) {
                reject("Error saving session: " + e.target.error);
            };
        });
    },

    /**
     * Fetches all saved sessions sorted by timestamp descending.
     * @returns {Promise<Array>}
     */
    getAllSessions: function() {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject("Database not initialized");
                return;
            }
            var transaction = this.db.transaction([this.storeName], "readonly");
            var store = transaction.objectStore(this.storeName);
            var request = store.getAll();

            request.onsuccess = function(event) {
                var results = event.target.result || [];
                // Sort by timestamp descending
                results.sort((a, b) => b.timestamp - a.timestamp);
                resolve(results);
            };

            request.onerror = function(e) {
                reject("Error fetching sessions: " + e.target.error);
            };
        });
    },

    /**
     * Deletes a session by ID.
     * @param {string} id - The ID of the session to delete.
     * @returns {Promise<void>}
     */
    deleteSession: function(id) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject("Database not initialized");
                return;
            }
            var transaction = this.db.transaction([this.storeName], "readwrite");
            var store = transaction.objectStore(this.storeName);
            var request = store.delete(id);

            request.onsuccess = function() {
                resolve();
            };

            request.onerror = function(e) {
                reject("Error deleting session: " + e.target.error);
            };
        });
    }
};
