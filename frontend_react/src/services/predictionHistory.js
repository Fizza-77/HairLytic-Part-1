import axios from 'axios';

/**
 * Loads prediction history from the backend
 * @param {string} token - JWT authentication token
 * @param {string} apiBase - Base API URL
 * @returns {Promise<Array>} Array of history items
 */
export const loadHistory = async (token, apiBase) => {
    try {
        const response = await axios.get(`${apiBase}/history`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } catch (err) {
        console.error('History load failed', err);
        throw err;
    }
};

/**
 * Fetches a specific history image from the backend
 * @param {Object} item - History item containing image_filename and username
 * @param {string} username - Current user's username (fallback)
 * @param {string} token - JWT authentication token
 * @param {string} apiBase - Base API URL
 * @returns {Promise<string>} Blob URL for the image
 */
export const fetchHistoryImage = async (item, username, token, apiBase) => {
    if (!item.image_filename) {
        throw new Error('Image reference missing for this prediction');
    }

    try {
        // Reconstruct path: /uploads/{username}/{image_filename}
        const response = await axios.get(`${apiBase}/uploads/${item.username || username}/${item.image_filename}`, {
            headers: { Authorization: `Bearer ${token}` },
            responseType: 'blob'
        });
        const url = URL.createObjectURL(response.data);
        return url;
    } catch (err) {
        console.error('Failed to fetch history image', err);
        throw new Error('Unable to retrieve image from server');
    }
};

/**
 * Hides a history item by adding its ID to the deleted list in localStorage
 * @param {string} id - History item ID to hide
 * @param {Array<string>} deletedIds - Current array of deleted IDs
 * @param {Function} setDeletedIds - State setter for deleted IDs
 */
export const handleHideHistory = (id, deletedIds, setDeletedIds) => {
    const newDeleted = [...deletedIds, id];
    setDeletedIds(newDeleted);
    localStorage.setItem('deleted_history_ids', JSON.stringify(newDeleted));
};
