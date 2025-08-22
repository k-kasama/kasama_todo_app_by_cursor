class TodoApp {
    constructor() {
        this.todos = [];
        this.filter = 'all';
        this.dbName = 'TodoAppDB';
        this.dbVersion = 4; // バージョンを上げてスキーマを更新（コメントフィールド追加）
        this.storeName = 'todos';
        this.db = null;
        this.extractedTodos = []; // 抽出されたTODOアイテムを保存
        this.useLocalStorage = false; // ローカルストレージフォールバックフラグ
        this.isLoading = true; // ローディング状態フラグ
        
        this.init();
    }

    async init() {
        // 初期ローディング表示
        this.showLoading();
        
        try {
            await this.initDB();
        } catch (error) {
            // IndexedDBが失敗した場合、ローカルストレージを使用
            try {
                this.useLocalStorage = true;
            } catch (fallbackError) {
                console.error('ローカルストレージフォールバックエラー:', fallbackError);
                return;
            }
        }
        
        try {
            await this.loadTodos();
        } catch (error) {
            console.error('TODO読み込みエラー:', error);
            return;
        }
        
        try {
            this.setupEventListeners();
        } catch (error) {
            console.error('イベントリスナー設定エラー:', error);
            return;
        }
        
        // ローディング完了
        this.hideLoading();
    }

    showLoading() {
        this.isLoading = true;
        const todoList = document.getElementById('todoList');
        const loadingState = document.getElementById('loadingState');
        
        if (todoList && loadingState) {
            // ローディング表示を設定
            todoList.innerHTML = '';
            todoList.appendChild(loadingState);
            loadingState.style.display = 'block';
        }
    }

    hideLoading() {
        this.isLoading = false;
        const loadingState = document.getElementById('loadingState');
        if (loadingState) {
            loadingState.style.display = 'none';
        }
        // ローディング完了後に再レンダリング
        this.render();
    }

    async initDB() {
        // IndexedDBのサポート確認
        if (!window.indexedDB) {
            throw new Error('IndexedDBがサポートされていません');
        }
        
        // ローカルストレージのサポート確認
        if (!window.localStorage) {
            throw new Error('localStorageがサポートされていません');
        }
        
        return new Promise((resolve, reject) => {
            // タイムアウトを設定
            const timeout = setTimeout(() => {
                reject(new Error('IndexedDB接続がタイムアウトしました'));
            }, 10000); // 10秒でタイムアウト
            
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = (event) => {
                clearTimeout(timeout);
                reject(request.error);
            };
            
            request.onsuccess = (event) => {
                clearTimeout(timeout);
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                try {
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
                        store.createIndex('completed', 'completed', { unique: false });
                        store.createIndex('priority', 'priority', { unique: false });
                        store.createIndex('deadline', 'deadline', { unique: false });
                        store.createIndex('category', 'category', { unique: false });
                        store.createIndex('parentId', 'parentId', { unique: false });
                        store.createIndex('status', 'status', { unique: false });
                    } else {
                        const store = event.currentTarget.transaction.objectStore(this.storeName);
                        if (!store.indexNames.contains('category')) {
                            store.createIndex('category', 'category', { unique: false });
                        }
                        if (!store.indexNames.contains('parentId')) {
                            store.createIndex('parentId', 'parentId', { unique: false });
                        }
                        if (!store.indexNames.contains('status')) {
                            store.createIndex('status', 'status', { unique: false });
                        }
                    }
                } catch (error) {
                    reject(error);
                }
            };
            
            request.onblocked = (event) => {
                console.warn('IndexedDB blocked:', event);
            };
        });
    }

    async loadTodos() {
        return new Promise((resolve, reject) => {
            if (this.useLocalStorage) {
                // ローカルストレージから読み込み
                try {
                    const storedTodos = localStorage.getItem('todoApp_todos');
                    this.todos = storedTodos ? JSON.parse(storedTodos) : [];
                    
                    // 古いデータ形式を新しい形式に変換
                    this.todos = this.todos.map(todo => ({
                        ...todo,
                        status: todo.status || 'not-started',
                        time: todo.time || 0,
                        deadline: todo.deadline || '',
                        priority: todo.priority || 'medium',
                        comment: todo.comment || ''
                    }));
                    
                    resolve();
                } catch (error) {
                    console.error('ローカルストレージ読み込みエラー:', error);
                    this.todos = [];
                    resolve();
                }
            } else {
                // IndexedDBから読み込み
                if (!this.db) {
                    reject(new Error('Database not initialized'));
                    return;
                }

                const transaction = this.db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.getAll();

                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    this.todos = request.result || [];
                    resolve();
                };
            }
        });
    }

    async saveTodo(todo) {
        return new Promise((resolve, reject) => {
            if (this.useLocalStorage) {
                // ローカルストレージに保存
                try {
                    todo.id = Date.now() + Math.random(); // ユニークIDを生成
                    this.todos.push(todo);
                    localStorage.setItem('todoApp_todos', JSON.stringify(this.todos));
                    resolve();
                } catch (error) {
                    console.error('ローカルストレージ保存エラー:', error);
                    reject(error);
                }
            } else {
                // IndexedDBに保存
                if (!this.db) {
                    reject(new Error('Database not initialized'));
                    return;
                }

                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.add(todo);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    todo.id = request.result;
                    this.todos.push(todo);
                    resolve();
                };
            }
        });
    }

    async updateTodo(todo) {
        return new Promise((resolve, reject) => {
            if (this.useLocalStorage) {
                // ローカルストレージに更新
                try {
                    const index = this.todos.findIndex(t => t.id === todo.id);
                    if (index !== -1) {
                        this.todos[index] = todo;
                        localStorage.setItem('todoApp_todos', JSON.stringify(this.todos));
                        resolve();
                    } else {
                        reject(new Error('Todo not found'));
                    }
                } catch (error) {
                    console.error('ローカルストレージ更新エラー:', error);
                    reject(error);
                }
            } else {
                // IndexedDBに更新
                if (!this.db) {
                    reject(new Error('Database not initialized'));
                    return;
                }

                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.put(todo);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const index = this.todos.findIndex(t => t.id === todo.id);
                    if (index !== -1) {
                        this.todos[index] = todo;
                    }
                    resolve();
                };
            }
        });
    }

    async deleteTodo(id) {
        return new Promise((resolve, reject) => {
            if (this.useLocalStorage) {
                // ローカルストレージから削除
                try {
                    this.todos = this.todos.filter(todo => todo.id !== id);
                    localStorage.setItem('todoApp_todos', JSON.stringify(this.todos));
                    resolve();
                } catch (error) {
                    console.error('ローカルストレージ削除エラー:', error);
                    reject(error);
                }
            } else {
                // IndexedDBから削除
                if (!this.db) {
                    reject(new Error('Database not initialized'));
                    return;
                }

                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.delete(id);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    this.todos = this.todos.filter(todo => todo.id !== id);
                    resolve();
                };
            }
        });
    }

    async clearAllTodos() {
        return new Promise((resolve, reject) => {
            if (this.useLocalStorage) {
                // ローカルストレージをクリア
                try {
                    this.todos = [];
                    localStorage.removeItem('todoApp_todos');
                    resolve();
                } catch (error) {
                    console.error('ローカルストレージクリアエラー:', error);
                    reject(error);
                }
            } else {
                // IndexedDBをクリア
                if (!this.db) {
                    reject(new Error('Database not initialized'));
                    return;
                }

                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.clear();

                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    this.todos = [];
                    resolve();
                };
            }
        });
    }

    async addTodo(text, category = 'major', parentId = null, priority = 'medium', status = 'not-started', time = 0, deadline = '', comment = '') {
        if (text.trim() === '') {
            return;
        }

        const todo = {
            text: text.trim(),
            completed: false,
            category: category,
            parentId: parentId,
            priority: priority,
            status: status,
            time: parseInt(time) || 0,
            deadline: deadline,
            comment: comment,
            createdAt: new Date().toISOString()
        };

        try {
            this.showLoading();
            await this.saveTodo(todo);
            this.hideLoading();
            this.showNotification('TODOが追加されました！');
        } catch (error) {
            this.hideLoading();
            console.error('Error adding todo:', error);
            this.showNotification('TODOの追加に失敗しました', 'error');
        }
    }

    async toggleTodo(id) {
        const todo = this.todos.find(t => t.id === id);
        if (todo) {
            todo.completed = !todo.completed;
            try {
                this.showLoading();
                await this.updateTodo(todo);
                
                // 下位項目が完了した場合、上位項目も自動で完了する
                if (todo.completed && todo.category !== 'major') {
                    await this.checkParentCompletion(todo.parentId);
                }
                
                // 上位項目が完了した場合、下位項目も自動で完了する
                if (todo.completed && todo.category === 'major') {
                    await this.completeChildTodos(todo.id);
                }
                
                this.hideLoading();
            } catch (error) {
                this.hideLoading();
                console.error('Error updating todo:', error);
                this.showNotification('TODOの更新に失敗しました', 'error');
            }
        }
    }

    async startTodo(id) {
        const todo = this.todos.find(t => t.id === id);
        if (todo && todo.status === 'not-started') {
            todo.status = 'in-progress';
            try {
                this.showLoading();
                await this.updateTodo(todo);
                this.hideLoading();
                this.showNotification('取り組みを開始しました！', 'success');
            } catch (error) {
                this.hideLoading();
                console.error('Error starting todo:', error);
                this.showNotification('ステータスの更新に失敗しました', 'error');
            }
        }
    }

    async pauseTodo(id) {
        const todo = this.todos.find(t => t.id === id);
        if (todo && todo.status === 'in-progress') {
            todo.status = 'not-started';
            try {
                this.showLoading();
                await this.updateTodo(todo);
                this.hideLoading();
                this.showNotification('取り組みを一時停止しました', 'info');
            } catch (error) {
                this.hideLoading();
                console.error('Error pausing todo:', error);
                this.showNotification('ステータスの更新に失敗しました', 'error');
            }
        }
    }

    async toggleStatus(id) {
        const todo = this.todos.find(t => t.id === id);
        if (todo) {
            const newStatus = todo.status === 'not-started' ? 'in-progress' : 'not-started';
            todo.status = newStatus;
            try {
                this.showLoading();
                await this.updateTodo(todo);
                this.hideLoading();
                const message = newStatus === 'in-progress' ? '取り組みを開始しました！' : '取り組みを一時停止しました';
                const type = newStatus === 'in-progress' ? 'success' : 'info';
                this.showNotification(message, type);
            } catch (error) {
                this.hideLoading();
                console.error('Error toggling status:', error);
                this.showNotification('ステータスの更新に失敗しました', 'error');
            }
        }
    }

    toggleCommentView(id) {
        const commentElement = document.getElementById(`comment-${id}`);
        if (commentElement) {
            const isVisible = commentElement.style.display !== 'none';
            commentElement.style.display = isVisible ? 'none' : 'block';
        }
    }

    async deleteTodoById(id) {
        const todo = this.todos.find(t => t.id === id);
        if (!todo) return;

        // 確認ダイアログ
        const confirmed = confirm(`「${todo.text}」を削除しますか？`);
        if (!confirmed) return;

        try {
            this.showLoading();
            await this.deleteTodo(id);
            this.hideLoading();
            this.showNotification('TODOが削除されました！');
        } catch (error) {
            this.hideLoading();
            console.error('Error deleting todo:', error);
            this.showNotification('TODOの削除に失敗しました', 'error');
        }
    }

    openEditModal(id) {
        const todo = this.todos.find(t => t.id == id);
        
        if (!todo) return;

        // モーダルに現在の値を設定
        const editText = document.getElementById('editText');
        const editCategory = document.getElementById('editCategory');
        const editPriority = document.getElementById('editPriority');
        const editStatus = document.getElementById('editStatus');
        const editTime = document.getElementById('editTime');
        const editDeadline = document.getElementById('editDeadline');
        const editComment = document.getElementById('editComment');
        
        if (editText) editText.value = todo.text;
        if (editCategory) editCategory.value = todo.category || 'major';
        if (editPriority) editPriority.value = todo.priority || 'medium';
        if (editStatus) editStatus.value = todo.status || 'not-started';
        if (editTime) {
            const timeValue = todo.time ? parseFloat(todo.time) : '';
            editTime.value = timeValue;
        }
        if (editDeadline) editDeadline.value = todo.deadline || '';
        if (editComment) editComment.value = todo.comment || '';
        
        // 親項目の選択肢を更新
        this.updateEditParentOptions(todo.category, todo.parentId);
        
        // 編集対象のIDを保存
        const editModal = document.getElementById('editModal');
        editModal.dataset.editId = id;
        
        // モーダルを表示
        editModal.style.display = 'block';
    }

    closeEditModal() {
        document.getElementById('editModal').style.display = 'none';
        document.getElementById('editModal').dataset.editId = '';
    }

    updateEditParentOptions(category, currentParentId = null) {
        const parentSelect = document.getElementById('editParent');
        parentSelect.innerHTML = '<option value="">親項目を選択</option>';
        
        if (category === 'major') {
            parentSelect.style.display = 'none';
            return;
        }
        
        parentSelect.style.display = 'block';
        
        let availableParents = [];
        if (category === 'middle') {
            availableParents = this.todos.filter(t => t.category === 'major');
        } else if (category === 'minor') {
            availableParents = this.todos.filter(t => t.category === 'middle');
        }
        
        availableParents.forEach(parent => {
            const option = document.createElement('option');
            option.value = parent.id;
            option.textContent = parent.text;
            if (currentParentId && parent.id === currentParentId) {
                option.selected = true;
            }
            parentSelect.appendChild(option);
        });
    }

    async saveEdit() {
        const editId = document.getElementById('editModal').dataset.editId;
        
        if (!editId) return;

        const todo = this.todos.find(t => t.id == editId);
        
        if (!todo) return;

        const editTimeElement = document.getElementById('editTime');
        const newText = document.getElementById('editText').value.trim();
        const newCategory = document.getElementById('editCategory').value;
        const newParentId = document.getElementById('editParent').value ? parseInt(document.getElementById('editParent').value) : null;
        const newPriority = document.getElementById('editPriority').value;
        const newStatus = document.getElementById('editStatus').value;
        const newTime = editTimeElement ? parseFloat(editTimeElement.value) || 0 : 0;
        const newDeadline = document.getElementById('editDeadline').value || '';
        const newComment = document.getElementById('editComment').value || '';

        if (newText === '') {
            this.showNotification('タスク名を入力してください', 'error');
            return;
        }

        // タスクを更新
        todo.text = newText;
        todo.category = newCategory;
        todo.parentId = newParentId;
        todo.priority = newPriority;
        todo.status = newStatus;
        todo.time = newTime;
        todo.deadline = newDeadline;
        todo.comment = newComment;

        try {
            await this.updateTodo(todo);
            this.closeEditModal();
            this.render();
            this.showNotification('TODOが更新されました！');
        } catch (error) {
            console.error('Error updating todo:', error);
            this.showNotification('TODOの更新に失敗しました', 'error');
        }
    }

    async clearCompleted() {
        const completedTodos = this.todos.filter(todo => todo.completed);
        try {
            for (const todo of completedTodos) {
                await this.deleteTodo(todo.id);
            }
            this.render();
            this.showNotification(`${completedTodos.length}個のTODOが削除されました！`);
        } catch (error) {
            console.error('Error clearing completed todos:', error);
            this.showNotification('完了したTODOの削除に失敗しました', 'error');
        }
    }

    async clearAll() {
        try {
            await this.clearAllTodos();
            this.render();
            this.showNotification('すべてのTODOが削除されました！');
        } catch (error) {
            console.error('Error clearing all todos:', error);
            this.showNotification('すべてのTODOの削除に失敗しました', 'error');
        }
    }

    render() {
        const todoList = document.getElementById('todoList');
        
        if (!todoList) {
            console.error('todoList要素が見つかりません');
            return;
        }
        
        // ローディング中は何もしない
        if (this.isLoading) {
            return;
        }
        
        const filteredTodos = this.getFilteredTodos();

        if (filteredTodos.length === 0) {
            todoList.innerHTML = this.getEmptyStateHTML();
            return;
        }

        todoList.innerHTML = filteredTodos.map(todo => this.getTodoHTML(todo)).join('');
        
        // 統計情報を更新
        this.updateStats();
        
        // イベントリスナーを再設定
        this.bindTodoEvents();
    }

    setFilter(filter) {
        this.filter = filter;
        
        // フィルターボタンのアクティブ状態を更新
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-filter="${filter}"]`).classList.add('active');
        
        // リストを再描画
        this.render();
    }

    // 親項目の完了チェック
    async checkParentCompletion(parentId) {
        if (!parentId) return;
        
        const parent = this.todos.find(t => t.id === parentId);
        if (!parent) return;
        
        const children = this.todos.filter(t => t.parentId === parentId);
        const allChildrenCompleted = children.length > 0 && children.every(child => child.completed);
        
        if (allChildrenCompleted && !parent.completed) {
            parent.completed = true;
            await this.updateTodo(parent);
            
            // さらに上位の親項目もチェック
            if (parent.parentId) {
                await this.checkParentCompletion(parent.parentId);
            }
        }
    }

    // 子項目の完了処理
    async completeChildTodos(parentId) {
        const children = this.todos.filter(t => t.parentId === parentId && !t.completed);
        
        for (const child of children) {
            child.completed = true;
            await this.updateTodo(child);
        }
    }

    getFilteredTodos() {
        switch (this.filter) {
            case 'active':
                return this.todos.filter(t => !t.completed);
            case 'completed':
                return this.todos.filter(t => t.completed);
            case 'not-started':
                return this.todos.filter(t => t.status === 'not-started');
            case 'in-progress':
                return this.todos.filter(t => t.status === 'in-progress');
            case 'high':
                return this.todos.filter(t => t.priority === 'high');
            case 'medium':
                return this.todos.filter(t => t.priority === 'medium');
            case 'low':
                return this.todos.filter(t => t.priority === 'low');
            default:
                return this.todos;
        }
    }

    getTodoHTML(todo) {
        const completedClass = todo.completed ? 'completed' : '';
        const checkedClass = todo.completed ? 'checked' : '';
        const categoryClass = todo.category || 'major';
        const priorityBadge = todo.priority ? `<span class="todo-priority ${todo.priority}">${this.getPriorityLabel(todo.priority)}</span>` : '';
        const statusBadge = todo.status ? `<span class="todo-status ${todo.status} ${!todo.completed ? 'clickable' : ''}" ${!todo.completed ? `onclick="todoApp.toggleStatus(${todo.id})" title="クリックしてステータスを変更"` : ''}>${this.getStatusLabel(todo.status)}</span>` : '';
        const timeBadge = todo.time ? `<span class="todo-time">${todo.time}時間</span>` : '';
        const deadlineBadge = todo.deadline ? `<span class="todo-deadline">${this.formatDate(todo.deadline)}</span>` : '';
        const categoryBadge = `<span class="todo-category ${categoryClass}">${this.getCategoryLabel(todo.category)}</span>`;
        const commentBadge = todo.comment ? `<span class="todo-comment" onclick="todoApp.toggleCommentView(${todo.id})" title="コメントを表示"><i class="fas fa-comment"></i></span>` : '';
        
        return `
            <div class="todo-item ${completedClass} ${categoryClass}" data-id="${todo.id}">
                <div class="todo-checkbox ${checkedClass}" onclick="todoApp.toggleTodo(${todo.id})"></div>
                <div class="todo-text">${this.escapeHtml(todo.text)}</div>
                ${categoryBadge}
                ${priorityBadge}
                ${statusBadge}
                ${timeBadge}
                ${deadlineBadge}
                ${commentBadge}
                ${todo.comment ? `<div class="todo-comment-content" id="comment-${todo.id}" style="display: none;">
                    <div class="comment-content">
                        <h4>5W1Hコメント:</h4>
                        <pre>${this.escapeHtml(todo.comment)}</pre>
                    </div>
                </div>` : ''}
                <div class="todo-actions">
                    ${!todo.completed ? (
                        todo.status === 'not-started' ? 
                            `<button class="todo-btn start" onclick="todoApp.startTodo(${todo.id})" title="取り組み開始">
                                <i class="fas fa-play"></i>
                            </button>` : 
                            `<button class="todo-btn pause" onclick="todoApp.pauseTodo(${todo.id})" title="取り組み一時停止">
                                <i class="fas fa-pause"></i>
                            </button>`
                    ) : ''}
                    <button class="todo-btn edit" onclick="todoApp.openEditModal(${todo.id})" title="編集">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="todo-btn delete" onclick="todoApp.deleteTodoById(${todo.id})" title="削除">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }

    getEmptyStateHTML() {
        const messages = {
            all: {
                icon: 'fas fa-clipboard-list',
                title: 'タスクがありません',
                message: '新しいタスクを追加して始めましょう！'
            },
            active: {
                icon: 'fas fa-check-circle',
                title: '完了済みのタスクがありません',
                message: 'すべてのタスクが完了しています！'
            },
            completed: {
                icon: 'fas fa-tasks',
                title: '完了済みのタスクがありません',
                message: 'まだタスクを完了していません'
            },
            high: {
                icon: 'fas fa-exclamation-triangle',
                title: '高優先度のタスクがありません',
                message: '高優先度のタスクを追加してください'
            },
            medium: {
                icon: 'fas fa-minus-circle',
                title: '中優先度のタスクがありません',
                message: '中優先度のタスクを追加してください'
            },
            low: {
                icon: 'fas fa-arrow-down',
                title: '低優先度のタスクがありません',
                message: '低優先度のタスクを追加してください'
            },
            'not-started': {
                icon: 'fas fa-clock',
                title: '取り組み前のタスクがありません',
                message: '取り組み前のタスクを追加してください'
            },
            'in-progress': {
                icon: 'fas fa-spinner',
                title: '取り組み中のタスクがありません',
                message: '取り組み中のタスクを追加してください'
            }
        };

        const currentMessage = messages[this.filter];
        
        return `
            <div class="empty-state">
                <i class="${currentMessage.icon}"></i>
                <h3>${currentMessage.title}</h3>
                <p>${currentMessage.message}</p>
            </div>
        `;
    }

    bindTodoEvents() {
        // チェックボックスのイベントは既にHTMLに埋め込まれているので、
        // ここでは必要に応じて追加のイベントを設定
    }

    updateStats() {
        const total = this.todos.length;
        const completed = this.todos.filter(t => t.completed).length;
        const active = total - completed;
        const inProgress = this.todos.filter(t => t.status === 'in-progress').length;
        const totalTime = this.todos.reduce((sum, todo) => sum + (todo.time || 0), 0);

        const totalCountEl = document.getElementById('totalCount');
        const completedCountEl = document.getElementById('completedCount');
        const activeCountEl = document.getElementById('activeCount');
        const inProgressCountEl = document.getElementById('inProgressCount');
        const totalTimeEl = document.getElementById('totalTime');

        if (totalCountEl) totalCountEl.textContent = total;
        if (completedCountEl) completedCountEl.textContent = completed;
        if (activeCountEl) activeCountEl.textContent = active;
        if (inProgressCountEl) inProgressCountEl.textContent = inProgress;
        if (totalTimeEl) totalTimeEl.textContent = totalTime;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showNotification(message, type = 'info') {
        // シンプルな通知システム
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // スタイルを適用
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '12px 20px',
            borderRadius: '8px',
            color: 'white',
            fontWeight: '500',
            zIndex: '1000',
            transform: 'translateX(100%)',
            transition: 'transform 0.3s ease',
            maxWidth: '300px',
            wordWrap: 'break-word'
        });

        // タイプに応じた色を設定
        const colors = {
            success: '#10b981',
            warning: '#f59e0b',
            error: '#ef4444',
            info: '#3b82f6'
        };
        notification.style.backgroundColor = colors[type] || colors.info;

        document.body.appendChild(notification);

        // アニメーション
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        // 自動削除
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    // メール機能のメソッド
    openEmailModal() {
        document.getElementById('emailModal').style.display = 'block';
        document.getElementById('emailSubject').focus();
    }

    closeEmailModal() {
        document.getElementById('emailModal').style.display = 'none';
        this.clearEmailForm();
    }

    clearEmailForm() {
        document.getElementById('emailSubject').value = '';
        document.getElementById('emailBody').value = '';
        document.getElementById('extractedTodos').innerHTML = '';
    }

    analyzeEmail() {
        const subject = document.getElementById('emailSubject').value.trim();
        const body = document.getElementById('emailBody').value.trim();
        
        if (!subject && !body) {
            this.showNotification('件名または本文を入力してください', 'warning');
            return;
        }

        const extractedTodos = this.extractTodosFromEmail(subject, body);
        this.displayExtractedTodos(extractedTodos);
        
        if (extractedTodos.length > 0) {
            this.showNotification(`${extractedTodos.length}個のTODOアイテムを抽出しました`, 'success');
        } else {
            this.showNotification('TODOアイテムが見つかりませんでした', 'info');
        }
    }

    extractTodosFromEmail(subject, body) {
        const todos = [];
        const fullText = `${subject}\n${body}`;
        
        // 全体的な期限を抽出
        const globalDeadline = this.extractGlobalDeadline(fullText);
        
        // 件名から直接TODOを抽出
        if (subject && subject.trim()) {
            const subjectText = subject.trim();
            // 件名が「件名：」で始まっていない場合は、そのままTODOとして扱う
            if (!subjectText.match(/^件名[：:]/)) {
                            todos.push({
                text: subjectText,
                priority: 'medium',
                status: 'not-started',
                time: 0,
                deadline: globalDeadline,
                lineNumber: 0
            });
            }
        }
        
        // TODOキーワードパターン（拡張）
        const todoPatterns = [
            /TODO[:\s]*([^\n\r]+)/gi,
            /To Do[:\s]*([^\n\r]+)/gi,
            /To-Do[:\s]*([^\n\r]+)/gi,
            /タスク[:\s]*([^\n\r]+)/gi,
            /やること[:\s]*([^\n\r]+)/gi,
            /作業[:\s]*([^\n\r]+)/gi,
            /確認[:\s]*([^\n\r]+)/gi,
            /対応[:\s]*([^\n\r]+)/gi,
            /検討[:\s]*([^\n\r]+)/gi,
            /準備[:\s]*([^\n\r]+)/gi,
            /件名[：:]\s*([^\n\r]+)/gi,
            /件名[：:]\s*([^\n\r]+)/gi
        ];

        // 優先度キーワード
        const priorityKeywords = {
            high: ['緊急', '急ぎ', '重要', '優先', 'urgent', 'important', 'asap', '至急'],
            medium: ['中程度', '普通', 'medium', 'moderate'],
            low: ['低', 'ゆっくり', 'low', 'later']
        };

        // 時間パターン
        const timePatterns = [
            /(\d+(?:\.\d+)?)\s*時間/,
            /(\d+(?:\.\d+)?)\s*h/,
            /(\d+(?:\.\d+)?)\s*hr/
        ];

        // 期限パターン
        const deadlinePatterns = [
            /(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/,
            /(\d{1,2}[-\/]\d{1,2})/,
            /期限[:\s]*([^\n\r]+)/,
            /締切[:\s]*([^\n\r]+)/
        ];

        // 各行をチェック
        const lines = fullText.split('\n');
        lines.forEach((line, index) => {
            line = line.trim();
            if (!line) return;

            // TODOパターンをチェック
            for (const pattern of todoPatterns) {
                const match = line.match(pattern);
                if (match) {
                    const todoText = match[1] ? match[1].trim() : line.replace(pattern, '').trim();
                    if (todoText && todoText.length > 2) {
                        const priority = this.determinePriority(line, priorityKeywords);
                        const time = this.extractTime(line, timePatterns);
                        const deadline = this.extractDeadline(line, deadlinePatterns) || globalDeadline;
                        
                        todos.push({
                            text: todoText,
                            priority: priority,
                            status: 'not-started',
                            time: time,
                            deadline: deadline,
                            lineNumber: index + 1
                        });
                        break;
                    }
                }
            }

            // 箇条書きパターンをチェック
            if (line.match(/^[\-\*•]\s*(.+)/)) {
                const todoText = line.replace(/^[\-\*•]\s*/, '').trim();
                if (todoText && todoText.length > 3) {
                    const priority = this.determinePriority(line, priorityKeywords);
                    const time = this.extractTime(line, timePatterns);
                    const deadline = this.extractDeadline(line, deadlinePatterns) || globalDeadline;
                    
                    todos.push({
                        text: todoText,
                        priority: priority,
                        status: 'not-started',
                        time: time,
                        deadline: deadline,
                        lineNumber: index + 1
                    });
                }
            }

            // 番号付きリストパターンをチェック
            if (line.match(/^\d+[\.\)]\s*(.+)/)) {
                const todoText = line.replace(/^\d+[\.\)]\s*/, '').trim();
                if (todoText && todoText.length > 3) {
                    const priority = this.determinePriority(line, priorityKeywords);
                    const time = this.extractTime(line, timePatterns);
                    const deadline = this.extractDeadline(line, deadlinePatterns) || globalDeadline;
                    
                    todos.push({
                        text: todoText,
                        priority: priority,
                        status: 'not-started',
                        time: time,
                        deadline: deadline,
                        lineNumber: index + 1
                    });
                }
            }
        });

        // 重複を除去（より厳密に）
        const uniqueTodos = [];
        const seen = new Set();
        todos.forEach(todo => {
            const key = todo.text.toLowerCase().trim();
            if (!seen.has(key) && key.length > 2) {
                seen.add(key);
                uniqueTodos.push(todo);
            }
        });

        return uniqueTodos;
    }

    extractTime(text, patterns) {
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                return parseFloat(match[1]);
            }
        }
        return 0;
    }

    extractGlobalDeadline(text) {
        // 全体的な期限を抽出（日本語形式対応）
        const deadlinePatterns = [
            /期限[：:]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/,
            /期限[：:]\s*(\d{1,2})月(\d{1,2})日/,
            /締切[：:]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/,
            /締切[：:]\s*(\d{1,2})月(\d{1,2})日/,
            /期限[：:]\s*(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/,
            /期限[：:]\s*(\d{1,2}[-\/]\d{1,2})/,
            /締切[：:]\s*(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/,
            /締切[：:]\s*(\d{1,2}[-\/]\d{1,2})/
        ];

        for (const pattern of deadlinePatterns) {
            const match = text.match(pattern);
            if (match) {
                if (match.length === 4) {
                    // 日本語形式: 2025年8月20日
                    const year = match[1];
                    const month = match[2].padStart(2, '0');
                    const day = match[3].padStart(2, '0');
                    return `${year}-${month}-${day}`;
                } else if (match.length === 3) {
                    // 日本語形式: 8月20日
                    const currentYear = new Date().getFullYear();
                    const month = match[1].padStart(2, '0');
                    const day = match[2].padStart(2, '0');
                    return `${currentYear}-${month}-${day}`;
                } else {
                    // 数字形式
                    const dateStr = match[1];
                    if (dateStr.match(/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$/)) {
                        return dateStr.replace(/\//g, '-');
                    } else if (dateStr.match(/^\d{1,2}[-\/]\d{1,2}$/)) {
                        const currentYear = new Date().getFullYear();
                        return `${currentYear}-${dateStr.replace(/\//g, '-')}`;
                    }
                }
            }
        }
        return null;
    }

    extractDeadline(text, patterns) {
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                const dateStr = match[1];
                // 日付形式を標準化
                if (dateStr.match(/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$/)) {
                    return dateStr.replace(/\//g, '-');
                } else if (dateStr.match(/^\d{1,2}[-\/]\d{1,2}$/)) {
                    const currentYear = new Date().getFullYear();
                    return `${currentYear}-${dateStr.replace(/\//g, '-')}`;
                }
            }
        }
        return null;
    }

    determinePriority(text, priorityKeywords) {
        const lowerText = text.toLowerCase();
        
        for (const [priority, keywords] of Object.entries(priorityKeywords)) {
            for (const keyword of keywords) {
                if (lowerText.includes(keyword.toLowerCase())) {
                    return priority;
                }
            }
        }
        
        return 'medium'; // デフォルト
    }

    displayExtractedTodos(todos) {
        const container = document.getElementById('extractedTodos');
        this.extractedTodos = todos; // 抽出結果を保存
        
        if (todos.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #6b7280; font-style: italic;">TODOアイテムが見つかりませんでした</p>';
            document.getElementById('extractedTodosActions').style.display = 'none';
            return;
        }

        const header = `
            <div class="extracted-todos-header">
                <h3>抽出されたTODOアイテム (${todos.length}個)</h3>
                <button id="addSelectedTodos" class="add-selected-btn">
                    <i class="fas fa-plus"></i> 選択したアイテムを追加
                </button>
            </div>
        `;

        const todoItems = todos.map((todo, index) => `
            <div class="extracted-todo-item">
                <input type="checkbox" id="todo-${index}" checked>
                <label for="todo-${index}" class="todo-text">${this.escapeHtml(todo.text)}</label>
                <span class="todo-priority ${todo.priority}">${this.getPriorityLabel(todo.priority)}</span>
                <span class="todo-status ${todo.status}">${this.getStatusLabel(todo.status)}</span>
                ${todo.time ? `<span class="todo-time">${todo.time}時間</span>` : ''}
                ${todo.deadline ? `<span class="todo-deadline">${this.formatDate(todo.deadline)}</span>` : ''}
            </div>
        `).join('');

        container.innerHTML = header + todoItems;
        
        // アクションボタンを表示
        document.getElementById('extractedTodosActions').style.display = 'flex';
        
        // ボタンにイベントリスナーを設定
        const addButton = document.getElementById('addSelectedTodos');
        if (addButton) {
            addButton.addEventListener('click', () => this.addSelectedTodos());
        }
    }

    getPriorityLabel(priority) {
        const labels = {
            high: '高',
            medium: '中',
            low: '低'
        };
        return labels[priority] || '中';
    }

    getCategoryLabel(category) {
        const labels = {
            major: '大項目',
            middle: '中項目',
            minor: '小項目'
        };
        return labels[category] || '大項目';
    }

    getStatusLabel(status) {
        const labels = {
            'not-started': '取り組み前',
            'in-progress': '取り組み中'
        };
        return labels[status] || '取り組み前';
    }

    updateParentOptions(category) {
        const parentSelect = document.getElementById('todoParent');
        parentSelect.innerHTML = '<option value="">親項目を選択</option>';
        
        if (category === 'major') {
            parentSelect.style.display = 'none';
            return;
        }
        
        parentSelect.style.display = 'block';
        
        let availableParents = [];
        if (category === 'middle') {
            // 中項目の親は大項目のみ
            availableParents = this.todos.filter(t => t.category === 'major');
        } else if (category === 'minor') {
            // 小項目の親は中項目のみ
            availableParents = this.todos.filter(t => t.category === 'middle');
        }
        
        availableParents.forEach(parent => {
            const option = document.createElement('option');
            option.value = parent.id;
            option.textContent = parent.text;
            parentSelect.appendChild(option);
        });
    }

    async addSelectedTodos() {
        const checkboxes = document.querySelectorAll('#extractedTodos input[type="checkbox"]:checked');
        
        if (checkboxes.length === 0) {
            this.showNotification('追加するアイテムを選択してください', 'warning');
            return;
        }

        let addedCount = 0;

        for (const checkbox of checkboxes) {
            const todoItem = checkbox.closest('.extracted-todo-item');
            if (!todoItem) continue;

            const todoText = todoItem.querySelector('.todo-text').textContent;
            const priorityElement = todoItem.querySelector('.todo-priority');
            const timeElement = todoItem.querySelector('.todo-time');
            const deadlineElement = todoItem.querySelector('.todo-deadline');
            
            // 優先度の処理
            let priority = 'medium';
            if (priorityElement) {
                const priorityText = priorityElement.textContent;
                if (priorityText === '高') priority = 'high';
                else if (priorityText === '低') priority = 'low';
            }
            
            const time = timeElement ? parseFloat(timeElement.textContent.replace('時間', '')) : 0;
            const deadline = deadlineElement ? this.parseDateFromDisplay(deadlineElement.textContent) : '';

            // TODOアイテムを追加
            const todo = {
                text: todoText,
                completed: false,
                category: 'major', // デフォルトは大項目
                parentId: null,
                priority: priority,
                status: 'not-started',
                time: time,
                deadline: deadline,
                createdAt: new Date().toISOString()
            };
            
            try {
                await this.saveTodo(todo);
                addedCount++;
            } catch (error) {
                console.error('Error adding todo:', error);
            }
        }

        this.render();
        this.updateStats();
        this.closeEmailModal();
        
        this.showNotification(`${addedCount}個のTODOアイテムを追加しました`, 'success');
    }

    // 抽出結果編集機能
    openExtractedEditModal() {
        if (this.extractedTodos.length === 0) {
            this.showNotification('編集するTODOアイテムがありません', 'warning');
            return;
        }

        this.displayExtractedEditTodos();
        document.getElementById('extractedEditModal').style.display = 'block';
    }

    closeExtractedEditModal() {
        document.getElementById('extractedEditModal').style.display = 'none';
    }

    displayExtractedEditTodos() {
        const container = document.getElementById('extractedEditTodos');
        
        const todoItems = this.extractedTodos.map((todo, index) => `
            <div class="extracted-edit-todo-item" data-index="${index}">
                <input type="text" value="${this.escapeHtml(todo.text)}" placeholder="TODO内容" class="edit-todo-text">
                <select class="edit-todo-priority">
                    <option value="high" ${todo.priority === 'high' ? 'selected' : ''}>高</option>
                    <option value="medium" ${todo.priority === 'medium' ? 'selected' : ''}>中</option>
                    <option value="low" ${todo.priority === 'low' ? 'selected' : ''}>低</option>
                </select>
                <select class="edit-todo-status">
                    <option value="not-started" ${todo.status === 'not-started' ? 'selected' : ''}>取り組み前</option>
                    <option value="in-progress" ${todo.status === 'in-progress' ? 'selected' : ''}>取り組み中</option>
                </select>
                <input type="number" value="${todo.time || ''}" placeholder="時間" min="0.5" max="24" step="0.5" class="edit-todo-time">
                <input type="date" value="${todo.deadline || ''}" class="edit-todo-deadline">
                <button class="remove-todo-btn" onclick="todoApp.removeExtractedTodo(${index})" title="削除">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');

        container.innerHTML = todoItems;
    }

    removeExtractedTodo(index) {
        this.extractedTodos.splice(index, 1);
        this.displayExtractedEditTodos();
    }

    addNewExtractedTodo() {
        const newTodo = {
            text: '',
            priority: 'medium',
            status: 'not-started',
            time: 0,
            deadline: '',
            lineNumber: this.extractedTodos.length + 1
        };
        
        this.extractedTodos.push(newTodo);
        this.displayExtractedEditTodos();
        
        // 新しく追加されたアイテムのテキストフィールドにフォーカス
        const lastItem = document.querySelector('.extracted-edit-todo-item:last-child .edit-todo-text');
        if (lastItem) {
            lastItem.focus();
        }
    }

    saveExtractedEdit() {
        const todoItems = document.querySelectorAll('.extracted-edit-todo-item');
        const updatedTodos = [];

        todoItems.forEach((item, index) => {
            const text = item.querySelector('.edit-todo-text').value.trim();
            const priority = item.querySelector('.edit-todo-priority').value;
            const status = item.querySelector('.edit-todo-status').value;
            const time = parseFloat(item.querySelector('.edit-todo-time').value) || 0;
            const deadline = item.querySelector('.edit-todo-deadline').value;

            if (text) {
                updatedTodos.push({
                    text: text,
                    priority: priority,
                    status: status,
                    time: time,
                    deadline: deadline,
                    lineNumber: index + 1
                });
            }
        });

        this.extractedTodos = updatedTodos;
        this.displayExtractedTodos(updatedTodos);
        this.closeExtractedEditModal();
        this.showNotification('抽出結果を更新しました', 'success');
    }

    confirmExtractedTodos() {
        if (this.extractedTodos.length === 0) {
            this.showNotification('追加するTODOアイテムがありません', 'warning');
            return;
        }

        this.addSelectedTodos();
    }

    // スケジュール機能のメソッド
    openScheduleModal() {
        document.getElementById('scheduleModal').style.display = 'block';
    }

    closeScheduleModal() {
        document.getElementById('scheduleModal').style.display = 'none';
    }

    generateSchedule() {
        const workHoursPerDay = parseFloat(document.getElementById('workHoursPerDay').value) || 6;
        const startDate = document.getElementById('startDate').value;
        
        if (!startDate) {
            this.showNotification('開始日を設定してください', 'warning');
            return;
        }

        const activeTodos = this.todos.filter(t => !t.completed && t.time > 0);
        
        if (activeTodos.length === 0) {
            this.showNotification('時間が設定された未完了タスクがありません', 'info');
            return;
        }

        const schedule = this.createSchedule(activeTodos, workHoursPerDay, startDate);
        this.displaySchedule(schedule);
        
        this.showNotification('スケジュールを生成しました', 'success');
    }

    createSchedule(todos, workHoursPerDay, startDate) {
        // 優先度と期限でソート
        const sortedTodos = todos.sort((a, b) => {
            const priorityOrder = { high: 3, medium: 2, low: 1 };
            const aPriority = priorityOrder[a.priority] || 2;
            const bPriority = priorityOrder[b.priority] || 2;
            
            if (aPriority !== bPriority) {
                return bPriority - aPriority;
            }
            
            // 期限がある場合は期限でソート
            const aNormalizedDeadline = this.normalizeDeadline(a.deadline);
            const bNormalizedDeadline = this.normalizeDeadline(b.deadline);
            
            if (aNormalizedDeadline && bNormalizedDeadline) {
                const aDate = new Date(aNormalizedDeadline);
                const bDate = new Date(bNormalizedDeadline);
                return aDate - bDate;
            } else if (aNormalizedDeadline) {
                return -1;
            } else if (bNormalizedDeadline) {
                return 1;
            }
            
            return 0;
        });

        const schedule = [];
        let currentDate = new Date(startDate);
        let currentDayHours = 0;
        let currentDayTasks = [];

        for (const todo of sortedTodos) {
            // 平日のみ（月-金）に割り振り
            while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
                currentDate.setDate(currentDate.getDate() + 1);
            }

            // 新しい日を開始
            if (currentDayHours + todo.time > workHoursPerDay) {
                if (currentDayTasks.length > 0) {
                    schedule.push({
                        date: new Date(currentDate),
                        tasks: [...currentDayTasks],
                        totalHours: currentDayHours
                    });
                }
                
                currentDate.setDate(currentDate.getDate() + 1);
                while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
                    currentDate.setDate(currentDate.getDate() + 1);
                }
                
                currentDayHours = 0;
                currentDayTasks = [];
            }

            currentDayTasks.push({
                ...todo,
                startTime: this.calculateStartTime(currentDayHours)
            });
            currentDayHours += todo.time;
        }

        // 最後の日のタスクを追加
        if (currentDayTasks.length > 0) {
            schedule.push({
                date: new Date(currentDate),
                tasks: currentDayTasks,
                totalHours: currentDayHours
            });
        }

        return schedule;
    }

    calculateStartTime(hoursFromStart) {
        const startHour = 9; // 9時開始
        const totalMinutes = hoursFromStart * 60;
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        
        const startTime = new Date();
        startTime.setHours(startHour + hours, minutes, 0, 0);
        
        return startTime.toTimeString().slice(0, 5);
    }

    displaySchedule(schedule) {
        const container = document.getElementById('scheduleResult');
        
        if (schedule.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #6b7280; font-style: italic;">スケジュールが生成できませんでした</p>';
            return;
        }

        const totalHours = schedule.reduce((sum, day) => sum + day.totalHours, 0);
        const totalDays = schedule.length;

        const summary = `
            <div class="schedule-summary">
                <h4>スケジュール概要</h4>
                <p>総作業時間: ${totalHours}時間</p>
                <p>必要日数: ${totalDays}日</p>
                <p>平均作業時間/日: ${(totalHours / totalDays).toFixed(1)}時間</p>
            </div>
        `;

        const scheduleHTML = schedule.map(day => {
            const dateStr = this.formatDate(day.date.toISOString().split('T')[0]);
            const dayName = this.getDayName(day.date.getDay());
            
            const tasksHTML = day.tasks.map(task => `
                <div class="schedule-task">
                    <div class="schedule-task-time">${task.startTime}</div>
                    <div class="schedule-task-text">${this.escapeHtml(task.text)}</div>
                    <span class="schedule-task-priority ${task.priority || 'medium'}">${this.getPriorityLabel(task.priority)}</span>
                    <span class="todo-time">${task.time}時間</span>
                </div>
            `).join('');

            return `
                <div class="schedule-day">
                    <div class="schedule-day-header">
                        <span>${dateStr} (${dayName})</span>
                        <span>${day.totalHours}時間</span>
                    </div>
                    <div class="schedule-day-tasks">
                        ${tasksHTML}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = summary + scheduleHTML;
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return `${date.getMonth() + 1}/${date.getDate()}`;
    }

    getDayName(day) {
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        return days[day];
    }

    // 期限の日付形式を統一するヘルパー関数
    normalizeDeadline(deadline) {
        if (!deadline) return '';
        
        // 既にYYYY-MM-DD形式の場合はそのまま返す
        if (/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
            return deadline;
        }
        
        // 日付オブジェクトに変換してYYYY-MM-DD形式に戻す
        const date = new Date(deadline);
        if (isNaN(date.getTime())) {
            return '';
        }
        
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        
        return `${year}-${month}-${day}`;
    }

    parseDateFromDisplay(displayDate) {
        // "M/D" 形式から "YYYY-MM-DD" 形式に変換
        const parts = displayDate.split('/');
        if (parts.length === 2) {
            const currentYear = new Date().getFullYear();
            const month = parts[0].padStart(2, '0');
            const day = parts[1].padStart(2, '0');
            return `${currentYear}-${month}-${day}`;
        }
        return null;
    }

        setupEventListeners() {
        // タスク追加
        const addTodoBtn = document.getElementById('addTodo');
        const todoInput = document.getElementById('todoInput');
        
        if (addTodoBtn) {
            addTodoBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleAddTodo();
            });
        }
        
        if (todoInput) {
            todoInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleAddTodo();
                }
            });
        }

        // フィルター
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setFilter(e.target.dataset.filter);
            });
        });

        // 一括操作
        document.getElementById('clearCompleted').addEventListener('click', () => this.clearCompleted());
        document.getElementById('clearAll').addEventListener('click', () => this.clearAll());

        // メール機能
        document.getElementById('emailImportBtn').addEventListener('click', () => this.openEmailModal());
        document.getElementById('closeEmailModal').addEventListener('click', () => this.closeEmailModal());
        document.getElementById('analyzeEmail').addEventListener('click', () => this.analyzeEmail());
        document.getElementById('clearEmail').addEventListener('click', () => this.clearEmailForm());
        
        // メールモーダル内のイベント委譲
        document.getElementById('emailModal').addEventListener('click', (e) => {
            if (e.target.id === 'addSelectedTodos' || e.target.closest('#addSelectedTodos')) {
                this.addSelectedTodos();
            }
        });
        
        // 抽出結果アクションボタンのイベントリスナー
        document.getElementById('addNewTodo').addEventListener('click', () => this.addNewExtractedTodo());
        document.getElementById('editExtractedTodos').addEventListener('click', () => this.openExtractedEditModal());
        document.getElementById('confirmExtractedTodos').addEventListener('click', () => this.confirmExtractedTodos());
        
        // 抽出結果編集モーダルのイベントリスナー
        document.getElementById('closeExtractedEditModal').addEventListener('click', () => this.closeExtractedEditModal());
        document.getElementById('saveExtractedEdit').addEventListener('click', () => this.saveExtractedEdit());
        document.getElementById('cancelExtractedEdit').addEventListener('click', () => this.closeExtractedEditModal());
        
        // スケジュール機能
        document.getElementById('scheduleBtn').addEventListener('click', () => this.openScheduleModal());
        document.getElementById('closeScheduleModal').addEventListener('click', () => this.closeScheduleModal());
        document.getElementById('generateSchedule').addEventListener('click', () => this.generateSchedule());
        
        // モーダル外クリックで閉じる
        document.getElementById('emailModal').addEventListener('click', (e) => {
            if (e.target.id === 'emailModal') {
                this.closeEmailModal();
            }
        });
        
        document.getElementById('scheduleModal').addEventListener('click', (e) => {
            if (e.target.id === 'scheduleModal') {
                this.closeScheduleModal();
            }
        });
        
        document.getElementById('editModal').addEventListener('click', (e) => {
            if (e.target.id === 'editModal') {
                this.closeEditModal();
            }
        });
        
        document.getElementById('extractedEditModal').addEventListener('click', (e) => {
            if (e.target.id === 'extractedEditModal') {
                this.closeExtractedEditModal();
            }
        });
        
        // 開始日のデフォルト値を設定
        document.getElementById('startDate').value = new Date().toISOString().split('T')[0];
        
        // カテゴリ選択時の親項目更新
        document.getElementById('todoCategory').addEventListener('change', (e) => {
            this.updateParentOptions(e.target.value);
        });
        
        // 編集モーダルのイベントリスナー
        document.getElementById('closeEditModal').addEventListener('click', () => this.closeEditModal());
        document.getElementById('saveEdit').addEventListener('click', () => this.saveEdit());
        document.getElementById('cancelEdit').addEventListener('click', () => this.closeEditModal());
        
        // 編集モーダルのカテゴリ変更時の親項目更新
        document.getElementById('editCategory').addEventListener('change', (e) => {
            this.updateEditParentOptions(e.target.value);
        });
        
        // コメント機能のイベントリスナー
        const addCommentBtn = document.getElementById('addCommentBtn');
        const saveCommentBtn = document.getElementById('saveComment');
        const cancelCommentBtn = document.getElementById('cancelComment');
        
                if (addCommentBtn) {
            addCommentBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const commentSection = document.getElementById('commentSection');
                if (commentSection) {
                    const currentDisplay = commentSection.style.display;
                    commentSection.style.display = currentDisplay === 'none' ? 'block' : 'none';
                    if (commentSection.style.display === 'block') {
                        const todoComment = document.getElementById('todoComment');
                        if (todoComment) {
                            todoComment.focus();
                        }
                    }
                }
            });
        }
        
        if (saveCommentBtn) {
            saveCommentBtn.addEventListener('click', () => {
                const commentSection = document.getElementById('commentSection');
                if (commentSection) {
                    commentSection.style.display = 'none';
                }
            });
        }
        
        if (cancelCommentBtn) {
            cancelCommentBtn.addEventListener('click', () => {
                const todoComment = document.getElementById('todoComment');
                const commentSection = document.getElementById('commentSection');
                if (todoComment) {
                    todoComment.value = '';
                }
                if (commentSection) {
                    commentSection.style.display = 'none';
                }
            });
        }
    }

    handleAddTodo() {
        const input = document.getElementById('todoInput');
        const categoryInput = document.getElementById('todoCategory');
        const parentInput = document.getElementById('todoParent');
        const priorityInput = document.getElementById('todoPriority');
        const timeInput = document.getElementById('todoTime');
        const deadlineInput = document.getElementById('todoDeadline');
        
        const text = input ? input.value.trim() : '';
        const category = categoryInput ? categoryInput.value || 'major' : 'major';
        const parentId = parentInput && parentInput.value ? parseInt(parentInput.value) : null;
        const priority = priorityInput ? priorityInput.value || 'medium' : 'medium';
        const status = document.getElementById('todoStatus') ? document.getElementById('todoStatus').value || 'not-started' : 'not-started';
        const time = timeInput ? parseFloat(timeInput.value) || 0 : 0;
        const deadline = deadlineInput ? deadlineInput.value || '' : '';
        const comment = document.getElementById('todoComment') ? document.getElementById('todoComment').value || '' : '';
        
        if (text) {
            this.addTodo(text, category, parentId, priority, status, time, deadline, comment);
            input.value = '';
            categoryInput.value = '';
            parentInput.value = '';
            priorityInput.value = '';
            document.getElementById('todoStatus').value = '';
            timeInput.value = '';
            deadlineInput.value = '';
            document.getElementById('todoComment').value = '';
            document.getElementById('commentSection').style.display = 'none';
            input.focus();
        }
    }
}

// アプリケーションの初期化
let todoApp;
document.addEventListener('DOMContentLoaded', () => {
    // 少し遅延を入れてDOMの完全な読み込みを待つ
    setTimeout(() => {
        todoApp = new TodoApp();
    }, 100);
});

// キーボードショートカット
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter でタスク追加
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (todoApp) {
            todoApp.handleAddTodo();
        }
    }
    
    // Escape で入力フィールドをクリア
    if (e.key === 'Escape') {
        const todoInput = document.getElementById('todoInput');
        if (todoInput) {
            todoInput.value = '';
            todoInput.blur();
        }
    }
});

// ページ離脱時の警告（未保存の変更がある場合）
window.addEventListener('beforeunload', (e) => {
    const input = document.getElementById('todoInput');
    if (input && input.value.trim()) {
        e.preventDefault();
        e.returnValue = '入力中のタスクがあります。ページを離れますか？';
    }
});
