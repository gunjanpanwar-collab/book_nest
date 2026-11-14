// ======================================
// BOOKNEST - MAIN JAVASCRIPT
// Same element IDs as before, so your index.html keeps working.
// ======================================

// ---- Backend address ----
// After deploying the backend on Render, paste its URL below (no trailing slash).
const RENDER_BACKEND_URL = "https://booknest-api-d348.onrender.com";

const IS_LOCAL = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
const API_URL = IS_LOCAL ? "http://127.0.0.1:8000" : RENDER_BACKEND_URL;

document.addEventListener("DOMContentLoaded", function () {

    // ======================================
    // 1. SELECT HTML ELEMENTS
    // ======================================

    const bookGrid = document.getElementById("bookGrid");
    const bookDialog = document.getElementById("bookDialog");
    const addBookBtn = document.getElementById("addBookBtn");
    const closeDialog = document.getElementById("closeDialog");
    const bookForm = document.getElementById("bookForm");
    const bookSearch = document.getElementById("bookSearch");
    const genreFilter = document.getElementById("genreFilter");
    const bookSort = document.getElementById("bookSort");
    const bookshelfCount = document.getElementById("bookshelfCount");
    const shelfTabs = document.querySelectorAll(".shelf-tab");

    const VALID_STATUSES = ["Read", "Currently Reading", "Want to Read"];

    function createId() {
        return Date.now().toString() + Math.random().toString(36).slice(2);
    }

    // ======================================
    // 2. BOOKS: SAMPLE DATA AND STORAGE
    // ======================================

    const sampleBooks = [
        { title: "Pride and Prejudice", author: "Jane Austen", genre: "Romance", status: "Read" },
        { title: "1984", author: "George Orwell", genre: "Fiction", status: "Read" },
        { title: "The Silent Patient", author: "Alex Michaelides", genre: "Thriller", status: "Read" },
        { title: "Harry Potter", author: "J. K. Rowling", genre: "Fantasy", status: "Read" },
        { title: "To Kill a Mockingbird", author: "Harper Lee", genre: "Fiction", status: "Currently Reading" },
        { title: "The Girl with the Dragon Tattoo", author: "Stieg Larsson", genre: "Mystery", status: "Currently Reading" }
    ];

    const STORAGE_KEY = "booknestBooks";

    function loadBooks() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved !== null) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    return parsed.map(book => ({ ...book, id: book.id || createId() }));
                }
            }
        } catch (error) {
            console.error("Could not load books:", error);
        }
        return sampleBooks.map(book => ({ ...book, id: createId() }));
    }

    let books = loadBooks();

    function saveBooks() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
        } catch (error) {
            console.error("Could not save books:", error);
            alert("Books could not be saved. Please check your browser storage.");
        }
    }

    let activeStatus = "All";

    // Genres allowed in the Edit prompt = the options of the Add Book form
    function getAllowedGenres() {
        const select = document.getElementById("bookGenre");
        if (!select) return [];
        return Array.from(select.options)
            .map(option => option.value)
            .filter(value => value);
    }

    // ======================================
    // 3. ADD BOOK POPUP
    // ======================================

    if (addBookBtn && bookDialog && bookForm) {
        addBookBtn.addEventListener("click", function () {
            bookForm.reset();
            clearLookup();
            bookDialog.showModal();
        });
    }

    if (closeDialog && bookDialog) {
        closeDialog.addEventListener("click", function () {
            bookDialog.close();
        });
    }

    // ======================================
    // 4. STATISTICS
    // ======================================

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    }

    function updateStatistics() {
        const count = status => books.filter(book => book.status === status).length;
        setText("booksRead", count("Read"));
        setText("currentlyReading", count("Currently Reading"));
        setText("wantToRead", count("Want to Read"));
    }

    // ======================================
    // 4b. BOOK COVERS AND BOOK SEARCH (via the backend)
    // ======================================

    function createPlaceholderCover() {
        const placeholder = document.createElement("div");
        placeholder.className = "book-cover-placeholder";
        placeholder.textContent = "✧";
        return placeholder;
    }

    // Real cover if we have one, otherwise the beige placeholder
    function createCoverElement(book) {
        if (!book.cover) return createPlaceholderCover();

        const image = document.createElement("img");
        image.className = "book-cover-img";
        image.src = book.cover;
        image.alt = book.title + " cover";
        image.loading = "lazy";
        image.addEventListener("error", function () {
            image.replaceWith(createPlaceholderCover());
        });
        return image;
    }

    // Ask the backend to search for books (Google Books / Open Library)
    async function searchBooks(query, signal) {
        const response = await fetch(
            API_URL + "/books/search?q=" + encodeURIComponent(query),
            { signal: signal }
        );
        if (!response.ok) throw new Error("Search failed");
        const data = await response.json();
        return Array.isArray(data.results) ? data.results : [];
    }

    const bookLookup = document.getElementById("bookLookup");
    const lookupResults = document.getElementById("bookLookupResults");
    const lookupHint = document.getElementById("bookLookupHint");
    const DEFAULT_LOOKUP_HINT =
        "Pick a result to fill in the details and cover automatically, or type them below.";

    let selectedCover = "";
    let lookupTimer = null;
    let lookupController = null;

    function clearLookup() {
        selectedCover = "";
        clearTimeout(lookupTimer);
        if (lookupController) lookupController.abort();
        if (bookLookup) bookLookup.value = "";
        if (lookupResults) lookupResults.innerHTML = "";
        if (lookupHint) lookupHint.textContent = DEFAULT_LOOKUP_HINT;
    }

    function showLookupMessage(text) {
        if (!lookupResults) return;
        lookupResults.innerHTML = "";
        const item = document.createElement("li");
        item.className = "lookup-message";
        item.textContent = text;
        lookupResults.appendChild(item);
    }

    function chooseLookupResult(result) {
        document.getElementById("bookTitle").value = result.title;
        document.getElementById("bookAuthor").value = result.author;

        // Only use the genre if it exists in your dropdown
        if (result.genre && getAllowedGenres().includes(result.genre)) {
            document.getElementById("bookGenre").value = result.genre;
        }

        selectedCover = result.cover || "";
        lookupResults.innerHTML = "";
        lookupHint.textContent = result.genre
            ? "Filled in from \"" + result.title + "\". Check the genre and status, then save."
            : "Filled in from \"" + result.title + "\". Please choose a genre, then save.";
    }

    function renderLookupResults(results) {
        lookupResults.innerHTML = "";

        if (results.length === 0) {
            showLookupMessage("No books found. You can enter the details yourself below.");
            return;
        }

        results.forEach(function (result) {
            const item = document.createElement("li");
            const button = document.createElement("button");
            button.type = "button";
            button.className = "lookup-item";

            let thumb;
            if (result.cover) {
                thumb = document.createElement("img");
                thumb.className = "lookup-thumb";
                thumb.src = result.cover;
                thumb.alt = "";
                thumb.addEventListener("error", function () {
                    const empty = document.createElement("div");
                    empty.className = "lookup-thumb-empty";
                    empty.textContent = "✧";
                    thumb.replaceWith(empty);
                });
            } else {
                thumb = document.createElement("div");
                thumb.className = "lookup-thumb-empty";
                thumb.textContent = "✧";
            }

            const text = document.createElement("div");
            text.className = "lookup-text";
            const title = document.createElement("strong");
            title.textContent = result.title;
            const author = document.createElement("span");
            author.textContent =
                result.author + (result.year ? " · " + result.year : "");
            text.append(title, author);

            button.append(thumb, text);
            button.addEventListener("click", () => chooseLookupResult(result));
            item.appendChild(button);
            lookupResults.appendChild(item);
        });
    }

    async function runLookup(query) {
        if (lookupController) lookupController.abort();
        lookupController = new AbortController();
        const controller = lookupController;
        const timeout = setTimeout(() => controller.abort(), 60000);

        showLookupMessage("Searching...");

        try {
            const results = await searchBooks(query, controller.signal);
            renderLookupResults(results);
        } catch (error) {
            if (error.name === "AbortError" && lookupController !== controller) {
                return; // replaced by a newer search
            }
            showLookupMessage(
                "Search isn't available right now. You can still enter the details yourself."
            );
        } finally {
            clearTimeout(timeout);
        }
    }

    if (bookLookup && lookupResults && lookupHint) {
        bookLookup.addEventListener("input", function () {
            clearTimeout(lookupTimer);
            const query = bookLookup.value.trim();

            if (query.length < 2) {
                lookupResults.innerHTML = "";
                return;
            }
            // wait until the person pauses typing
            lookupTimer = setTimeout(() => runLookup(query), 400);
        });
    }

    // One-time: find covers for books that don't have one yet
    async function backfillCovers() {
        const pending = books.filter(book => !book.cover && !book.coverTried);

        for (const book of pending) {
            try {
                const results = await searchBooks(book.title + " " + book.author);
                const match = results.find(result => result.cover);
                if (match) book.cover = match.cover;
                book.coverTried = true;
                saveBooks();
                displayBooks();
            } catch (error) {
                return; // backend unreachable: try again on the next visit
            }
        }
    }

    // ======================================
    // 5. DISPLAY BOOKS
    // ======================================

    function displayBooks() {
        if (!bookGrid) return;
        bookGrid.innerHTML = "";

        let filtered = books.filter(book =>
            activeStatus === "All" || book.status === activeStatus
        );

        const searchText = bookSearch ? bookSearch.value.trim().toLowerCase() : "";
        filtered = filtered.filter(book =>
            book.title.toLowerCase().includes(searchText) ||
            book.author.toLowerCase().includes(searchText)
        );

        const selectedGenre = genreFilter ? genreFilter.value : "All";
        if (selectedGenre !== "All") {
            filtered = filtered.filter(book => book.genre === selectedGenre);
        }

        const sortType = bookSort ? bookSort.value : "";
        if (sortType === "az") {
            filtered.sort((a, b) => a.title.localeCompare(b.title));
        } else if (sortType === "za") {
            filtered.sort((a, b) => b.title.localeCompare(a.title));
        } else {
            filtered.reverse(); // most recently added first
        }

        if (bookshelfCount) {
            bookshelfCount.textContent =
                `Showing ${filtered.length} of ${books.length} books`;
        }

        if (filtered.length === 0) {
            const empty = document.createElement("p");
            empty.className = "empty-books-message";
            empty.textContent = "No books found. Try changing your search or filters.";
            bookGrid.appendChild(empty);
            return;
        }

        filtered.forEach(function (book) {
            const card = document.createElement("article");
            card.className = "book-card";

            const cover = createCoverElement(book);

            const title = document.createElement("h3");
            title.textContent = book.title;

            const author = document.createElement("p");
            author.textContent = book.author;

            const genre = document.createElement("span");
            genre.className = "genre-tag";
            genre.textContent = book.genre;

            const status = document.createElement("p");
            status.className = "book-status";
            status.textContent = book.status;

            const editBtn = document.createElement("button");
            editBtn.textContent = "Edit";
            editBtn.className = "edit-book-btn";
            editBtn.addEventListener("click", () => editBook(book.id));

            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "Delete";
            deleteBtn.className = "delete-book-btn";
            deleteBtn.addEventListener("click", () => deleteBook(book.id));

            card.append(cover, title, author, genre, status, editBtn, deleteBtn);
            bookGrid.appendChild(card);
        });
    }

    // ======================================
    // 6. SHELF TABS, SEARCH AND FILTERS
    // ======================================

    shelfTabs.forEach(function (tab) {
        tab.addEventListener("click", function () {
            shelfTabs.forEach(item => item.classList.remove("active"));
            tab.classList.add("active");
            activeStatus = tab.dataset.status;
            displayBooks();
        });
    });

    if (bookSearch) bookSearch.addEventListener("input", displayBooks);
    if (genreFilter) genreFilter.addEventListener("change", displayBooks);
    if (bookSort) bookSort.addEventListener("change", displayBooks);

    // ======================================
    // 7. ADD / EDIT / DELETE BOOKS
    // ======================================

    if (bookForm) {
        bookForm.addEventListener("submit", function (event) {
            event.preventDefault();

            const newBook = {
                id: createId(),
                title: document.getElementById("bookTitle").value.trim(),
                author: document.getElementById("bookAuthor").value.trim(),
                genre: document.getElementById("bookGenre").value,
                status: document.getElementById("bookStatus").value,
                cover: selectedCover
            };

            if (!newBook.title || !newBook.author || !newBook.genre) {
                alert("Please fill in all the book details.");
                return;
            }

            books.push(newBook);
            saveBooks();
            bookForm.reset();
            clearLookup();
            bookDialog.close();

            // Jump to the shelf where the new book lives
            activeStatus = newBook.status;
            shelfTabs.forEach(tab =>
                tab.classList.toggle("active", tab.dataset.status === activeStatus)
            );

            refreshDashboard();
        });
    }

    function editBook(bookId) {
        const book = books.find(item => item.id === bookId);
        if (!book) return;

        const newTitle = prompt("Enter book title:", book.title);
        if (newTitle === null) return;

        const newAuthor = prompt("Enter author:", book.author);
        if (newAuthor === null) return;

        const allowedGenres = getAllowedGenres();
        const newGenre = prompt(
            allowedGenres.length
                ? "Enter genre (" + allowedGenres.join(", ") + "):"
                : "Enter genre:",
            book.genre
        );
        if (newGenre === null) return;

        const newStatus = prompt(
            "Enter status: Read, Currently Reading, or Want to Read",
            book.status
        );
        if (newStatus === null) return;

        if (!newTitle.trim() || !newAuthor.trim() || !newGenre.trim()) {
            alert("Book details cannot be empty.");
            return;
        }

        // Match genre/status ignoring capital letters, then use the exact spelling
        const genreMatch = allowedGenres.find(
            genre => genre.toLowerCase() === newGenre.trim().toLowerCase()
        );
        if (allowedGenres.length && !genreMatch) {
            alert("Please enter one of these genres: " + allowedGenres.join(", "));
            return;
        }

        const statusMatch = VALID_STATUSES.find(
            status => status.toLowerCase() === newStatus.trim().toLowerCase()
        );
        if (!statusMatch) {
            alert("Please enter a valid reading status.");
            return;
        }

        book.title = newTitle.trim();
        book.author = newAuthor.trim();
        book.genre = genreMatch || newGenre.trim();
        book.status = statusMatch;

        saveBooks();
        refreshDashboard();
    }

    function deleteBook(bookId) {
        if (!confirm("Are you sure you want to delete this book?")) return;
        books = books.filter(book => book.id !== bookId);
        saveBooks();
        refreshDashboard();
    }

    // ======================================
    // 8. GENRE DOUGHNUT CHART
    // ======================================

    let genreChart;

    function updateGenreChart() {
        const canvas = document.getElementById("genreChart");
        if (!canvas || typeof Chart === "undefined") return;

        const genreCounts = {};
        books.forEach(function (book) {
            if (book.status === "Read") {
                genreCounts[book.genre] = (genreCounts[book.genre] || 0) + 1;
            }
        });

        if (genreChart) genreChart.destroy();

        genreChart = new Chart(canvas, {
            type: "doughnut",
            data: {
                labels: Object.keys(genreCounts),
                datasets: [{
                    data: Object.values(genreCounts),
                    backgroundColor: [
                        "#c58d70", "#879b7d", "#c7a8c7",
                        "#e5c779", "#9babbc", "#d5a9a0"
                    ],
                    borderWidth: 3,
                    borderColor: "#ffffff"
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: "bottom",
                        labels: {
                            padding: 18,
                            usePointStyle: true,
                            font: { family: "DM Sans", size: 11 }
                        }
                    }
                }
            }
        });
    }

    // ======================================
    // 9. READING JOURNAL
    // ======================================

    const journalForm = document.getElementById("journalForm");
    const journalBookSelect = document.getElementById("journalBook");
    const journalTypeSelect = document.getElementById("journalType");
    const journalRatingSelect = document.getElementById("journalRating");
    const journalRatingField = document.getElementById("ratingField");
    const journalTextInput = document.getElementById("journalText");
    const journalEntriesContainer = document.getElementById("journalEntries");

    const JOURNAL_STORAGE_KEY = "booknestJournalEntries";

    function loadJournalEntries() {
        try {
            const saved = localStorage.getItem(JOURNAL_STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) return parsed;
            }
        } catch (error) {
            console.error("Could not load journal entries:", error);
        }
        return [];
    }

    let journalEntries = loadJournalEntries();

    function saveJournalEntries() {
        try {
            localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(journalEntries));
        } catch (error) {
            console.error("Could not save journal entries:", error);
            alert("Your journal entry could not be saved.");
        }
    }

    function populateJournalBooks() {
        if (!journalBookSelect) return;
        const previouslySelected = journalBookSelect.value;

        journalBookSelect.innerHTML = '<option value="">Select a book</option>';
        books.forEach(function (book) {
            const option = document.createElement("option");
            option.value = book.id;
            option.textContent = book.title + " — " + book.author;
            journalBookSelect.appendChild(option);
        });

        if (books.some(book => book.id === previouslySelected)) {
            journalBookSelect.value = previouslySelected;
        }
    }

    function updateRatingVisibility() {
        if (!journalRatingField || !journalTypeSelect) return;
        journalRatingField.style.display =
            journalTypeSelect.value === "Review" ? "flex" : "none";
    }

    function displayJournalEntries() {
        if (!journalEntriesContainer) return;
        journalEntriesContainer.innerHTML = "";

        if (journalEntries.length === 0) {
            const empty = document.createElement("p");
            empty.className = "journal-empty";
            empty.textContent =
                "Your reading memories will appear here. Create your first entry!";
            journalEntriesContainer.appendChild(empty);
            return;
        }

        const sorted = [...journalEntries].sort(
            (a, b) => new Date(b.date) - new Date(a.date)
        );

        sorted.forEach(function (entry) {
            const card = document.createElement("article");
            card.className = "journal-entry-card";

            const type = document.createElement("span");
            type.className = "journal-entry-type";
            type.textContent = entry.type;

            // Use the book's current title if it still exists (handles renamed books)
            const linkedBook = books.find(book => book.id === entry.bookId);
            const title = document.createElement("h3");
            title.textContent = linkedBook ? linkedBook.title : entry.bookTitle;

            const content = document.createElement("p");
            content.textContent = entry.text;

            const date = document.createElement("p");
            date.className = "journal-entry-date";
            date.textContent = new Date(entry.date).toLocaleString();

            const deleteButton = document.createElement("button");
            deleteButton.className = "journal-delete-btn";
            deleteButton.textContent = "Delete Entry";
            deleteButton.addEventListener("click", () => deleteJournalEntry(entry.id));

            card.appendChild(type);
            card.appendChild(title);

            if (entry.type === "Review" && entry.rating) {
                const rating = document.createElement("div");
                rating.className = "journal-entry-rating";
                const stars = Math.min(5, Math.max(0, Number(entry.rating)));
                rating.textContent = "★".repeat(stars) + "☆".repeat(5 - stars);
                card.appendChild(rating);
            }

            card.appendChild(content);
            card.appendChild(date);
            card.appendChild(deleteButton);
            journalEntriesContainer.appendChild(card);
        });
    }

    function deleteJournalEntry(entryId) {
        if (!confirm("Are you sure you want to delete this journal entry?")) return;
        journalEntries = journalEntries.filter(entry => entry.id !== entryId);
        saveJournalEntries();
        displayJournalEntries();
    }

    if (journalForm && journalBookSelect && journalTypeSelect && journalTextInput) {

        journalBookSelect.addEventListener("focus", populateJournalBooks);
        journalTypeSelect.addEventListener("change", updateRatingVisibility);

        journalForm.addEventListener("submit", function (event) {
            event.preventDefault();

            const selectedBook = books.find(book => book.id === journalBookSelect.value);
            const entryType = journalTypeSelect.value;
            const entryText = journalTextInput.value.trim();

            if (!selectedBook) {
                alert("Please select a book from your bookshelf.");
                return;
            }
            if (!entryText) {
                alert("Please write something before saving.");
                return;
            }

            journalEntries.push({
                id: createId(),
                bookId: selectedBook.id,
                bookTitle: selectedBook.title,
                type: entryType,
                rating: entryType === "Review" && journalRatingSelect
                    ? Number(journalRatingSelect.value)
                    : null,
                text: entryText,
                date: new Date().toISOString()
            });

            saveJournalEntries();
            displayJournalEntries();
            journalForm.reset();
            updateRatingVisibility();
            alert("Your journal entry has been saved! ❤️");
        });
    }

    // ======================================
    // 10. REFRESH AND START
    // ======================================

    function refreshDashboard() {
        displayBooks();
        updateStatistics();
        updateGenreChart();
        populateJournalBooks();
        displayJournalEntries();
    }

    saveBooks();
    updateRatingVisibility();
    refreshDashboard();
    backfillCovers();

    // ======================================
    // 11. AI COMPANION (talks to the Python backend)
    // ======================================

    const chatMessages = document.getElementById("aiChatMessages");
    const messageInput = document.getElementById("aiMessageInput");
    const sendButton = document.getElementById("aiSendButton");

    if (chatMessages && messageInput && sendButton) {

        const chatHistory = []; // remembers the conversation: {role, text}

        // Wake up the free Render backend as soon as the page opens,
        // so it is ready by the time someone sends a message.
        console.log("BookNest AI backend:", API_URL);
        fetch(API_URL + "/health").catch(function () {});

        function addMessage(message, sender) {
            const wrapper = document.createElement("div");

            if (sender === "user") {
                wrapper.className = "user-message";
                const content = document.createElement("div");
                content.className = "user-message-content";
                content.textContent = message;
                wrapper.appendChild(content);
            } else {
                wrapper.className = "ai-message";
                const avatar = document.createElement("div");
                avatar.className = "ai-message-avatar";
                avatar.textContent = "✧";
                const content = document.createElement("div");
                content.className = "ai-message-content";
                content.textContent = message;
                wrapper.appendChild(avatar);
                wrapper.appendChild(content);
            }

            chatMessages.appendChild(wrapper);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            return wrapper;
        }

        async function sendMessage() {
            const message = messageInput.value.trim();
            if (!message) return;

            addMessage(message, "user");
            messageInput.value = "";

            sendButton.disabled = true;
            sendButton.textContent = "Thinking...";

            const loading = addMessage("Finding the perfect words for you... ♡", "ai");

            // Free Render servers can take ~1 minute to wake up
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 90000);

            try {
                const response = await fetch(API_URL + "/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        message: message,
                        history: chatHistory.slice(-10)
                    }),
                    signal: controller.signal
                });

                let data = {};
                try {
                    data = await response.json();
                } catch (parseError) {
                    // Non-JSON reply (for example a gateway error page)
                }

                loading.remove();

                if (!response.ok) {
                    throw new Error(
                        typeof data.detail === "string"
                            ? data.detail
                            : "Something went wrong. Please try again."
                    );
                }

                const reply = data.reply || "I couldn't generate a reply. Please try again.";
                addMessage(reply, "ai");

                chatHistory.push({ role: "user", text: message });
                chatHistory.push({ role: "ai", text: reply });

            } catch (error) {
                loading.remove();
                console.error("BookNest AI Error:", error);

                let friendly;
                if (error.name === "AbortError") {
                    friendly = "The AI service took too long to answer. It may still be waking up, so please try again in a minute. ♡";
                } else if (error instanceof TypeError) {
                    friendly = "I couldn't connect to the AI service. Please check your internet and try again. ♡";
                } else {
                    friendly = error.message;
                }

                addMessage(friendly, "ai");
            } finally {
                clearTimeout(timeout);
                sendButton.disabled = false;
                sendButton.textContent = "Send ↗";
                messageInput.focus();
            }
        }

        sendButton.addEventListener("click", sendMessage);

        messageInput.addEventListener("keydown", function (event) {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        });
    } else {
        console.log("BookNest AI chat elements not found.");
    }

    console.log("Welcome to BookNest!");
});
