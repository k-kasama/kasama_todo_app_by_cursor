class TodoApp {
    constructor() {
        this.todos = [];
        this.filter = 'all';
        this.dbName = 'TodoAppDB';
        this.dbVersion = 1;
        this.storeName = 'todos';
        this.db = null;
        
        this.init();
    }

    async init() {
        await this.initDB();
        await this.loadTodos();
        this.render();
        this.setupEventListeners();
    }

    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('completed', 'completed', { unique: false });
                    store.createIndex('priority', 'priority', { unique: false });
                    store.createIndex('deadline', 'deadline', { unique: false });
                }
            };
        });
    }

    async loadTodos() {
        return new Promise((resolve, reject) => {
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
        });
    }

    async saveTodo(todo) {
        return new Promise((resolve, reject) => {
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
        });
    }

    async updateTodo(todo) {
        return new Promise((resolve, reject) => {
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
        });
    }

    async deleteTodo(id) {
        return new Promise((resolve, reject) => {
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
        });
    }

    async clearAllTodos() {
        return new Promise((resolve, reject) => {
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
        });
    }

    async addTodo(text, priority = 'medium', time = 0, deadline = '') {
        if (text.trim() === '') return;

        const todo = {
            text: text.trim(),
            completed: false,
            priority: priority,
            time: parseInt(time) || 0,
            deadline: deadline,
            createdAt: new Date().toISOString()
        };

        try {
            await this.saveTodo(todo);
            this.render();
            this.showNotification('TODOが追加されました！');
        } catch (error) {
            console.error('Error adding todo:', error);
            this.showNotification('TODOの追加に失敗しました', 'error');
        }
    }

    async toggleTodo(id) {
        const todo = this.todos.find(t => t.id === id);
        if (todo) {
            todo.completed = !todo.completed;
            try {
                await this.updateTodo(todo);
                this.render();
            } catch (error) {
                console.error('Error updating todo:', error);
                this.showNotification('TODOの更新に失敗しました', 'error');
            }
        }
    }

    async deleteTodoById(id) {
        try {
            await this.deleteTodo(id);
            this.render();
            this.showNotification('TODOが削除されました！');
        } catch (error) {
            console.error('Error deleting todo:', error);
            this.showNotification('TODOの削除に失敗しました', 'error');
        }
    }

    async editTodo(id, newText) {
        const todo = this.todos.find(t => t.id === id);
        if (todo && newText.trim() !== '') {
            todo.text = newText.trim();
            try {
                await this.updateTodo(todo);
                this.render();
                this.showNotification('TODOが更新されました！');
            } catch (error) {
                console.error('Error updating todo:', error);
                this.showNotification('TODOの更新に失敗しました', 'error');
            }
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
        const filteredTodos = this.getFilteredTodos();

        if (filteredTodos.length === 0) {
            todoList.innerHTML = this.getEmptyStateHTML();
            return;
        }

        todoList.innerHTML = filteredTodos.map(todo => this.getTodoHTML(todo)).join('');
        
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

    getFilteredTodos() {
        switch (this.filter) {
            case 'active':
                return this.todos.filter(t => !t.completed);
            case 'completed':
                return this.todos.filter(t => t.completed);
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
        const priorityBadge = todo.priority ? `<span class="todo-priority ${todo.priority}">${this.getPriorityLabel(todo.priority)}</span>` : '';
        const timeBadge = todo.time ? `<span class="todo-time">${todo.time}時間</span>` : '';
        const deadlineBadge = todo.deadline ? `<span class="todo-deadline">${this.formatDate(todo.deadline)}</span>` : '';
        
        return `
            <div class="todo-item ${completedClass}" data-id="${todo.id}">
                <div class="todo-checkbox ${checkedClass}" onclick="todoApp.toggleTodo(${todo.id})"></div>
                <div class="todo-text">${this.escapeHtml(todo.text)}</div>
                ${priorityBadge}
                ${timeBadge}
                ${deadlineBadge}
                <div class="todo-actions">
                    <button class="todo-btn edit" onclick="todoApp.editTodo(${todo.id})" title="編集">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="todo-btn delete" onclick="todoApp.deleteTodo(${todo.id})" title="削除">
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
        const totalTime = this.todos.reduce((sum, todo) => sum + (todo.time || 0), 0);

        document.getElementById('totalCount').textContent = total;
        document.getElementById('completedCount').textContent = completed;
        document.getElementById('activeCount').textContent = active;
        document.getElementById('totalTime').textContent = totalTime;
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
        
        // TODOキーワードパターン
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
            /準備[:\s]*([^\n\r]+)/gi
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
                    if (todoText) {
                        const priority = this.determinePriority(line, priorityKeywords);
                        const time = this.extractTime(line, timePatterns);
                        const deadline = this.extractDeadline(line, deadlinePatterns);
                        
                        todos.push({
                            text: todoText,
                            priority: priority,
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
                    const deadline = this.extractDeadline(line, deadlinePatterns);
                    
                    todos.push({
                        text: todoText,
                        priority: priority,
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
                    const deadline = this.extractDeadline(line, deadlinePatterns);
                    
                    todos.push({
                        text: todoText,
                        priority: priority,
                        time: time,
                        deadline: deadline,
                        lineNumber: index + 1
                    });
                }
            }
        });

        // 重複を除去
        const uniqueTodos = [];
        const seen = new Set();
        todos.forEach(todo => {
            const key = todo.text.toLowerCase();
            if (!seen.has(key)) {
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
        
        if (todos.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #6b7280; font-style: italic;">TODOアイテムが見つかりませんでした</p>';
            return;
        }

        const header = `
            <div class="extracted-todos-header">
                <h3>抽出されたTODOアイテム (${todos.length}個)</h3>
                <button id="addSelectedTodos" class="add-selected-btn" onclick="todoApp.addSelectedTodos()">
                    <i class="fas fa-plus"></i> 選択したアイテムを追加
                </button>
            </div>
        `;

        const todoItems = todos.map((todo, index) => `
            <div class="extracted-todo-item">
                <input type="checkbox" id="todo-${index}" checked>
                <div class="todo-text">${this.escapeHtml(todo.text)}</div>
                <span class="todo-priority ${todo.priority}">${this.getPriorityLabel(todo.priority)}</span>
                ${todo.time ? `<span class="todo-time">${todo.time}時間</span>` : ''}
                ${todo.deadline ? `<span class="todo-deadline">${this.formatDate(todo.deadline)}</span>` : ''}
            </div>
        `).join('');

        container.innerHTML = header + todoItems;
    }

    getPriorityLabel(priority) {
        const labels = {
            high: '高',
            medium: '中',
            low: '低'
        };
        return labels[priority] || '中';
    }

    addSelectedTodos() {
        const checkboxes = document.querySelectorAll('#extractedTodos input[type="checkbox"]:checked');
        const addedCount = 0;

        checkboxes.forEach(checkbox => {
            const todoItem = checkbox.closest('.extracted-todo-item');
            const todoText = todoItem.querySelector('.todo-text').textContent;
            const priorityElement = todoItem.querySelector('.todo-priority');
            const timeElement = todoItem.querySelector('.todo-time');
            const deadlineElement = todoItem.querySelector('.todo-deadline');
            
            const priority = priorityElement ? priorityElement.textContent : null;
            const time = timeElement ? parseFloat(timeElement.textContent) : 0;
            const deadline = deadlineElement ? this.parseDateFromDisplay(deadlineElement.textContent) : null;

            // TODOアイテムを追加
            const todo = {
                id: Date.now() + Math.random(),
                text: todoText,
                completed: false,
                createdAt: new Date().toISOString(),
                priority: priority,
                time: time,
                deadline: deadline
            };
            
            this.todos.unshift(todo);
        });

        this.saveTodos();
        this.render();
        this.updateStats();
        this.closeEmailModal();
        
        this.showNotification(`${checkboxes.length}個のTODOアイテムを追加しました`, 'success');
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
            if (a.deadline && b.deadline) {
                return new Date(a.deadline) - new Date(b.deadline);
            } else if (a.deadline) {
                return -1;
            } else if (b.deadline) {
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
        document.getElementById('addTodo').addEventListener('click', () => this.handleAddTodo());
        document.getElementById('todoInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleAddTodo();
        });

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
        
        // 開始日のデフォルト値を設定
        document.getElementById('startDate').value = new Date().toISOString().split('T')[0];
    }

    handleAddTodo() {
        const input = document.getElementById('todoInput');
        const priorityInput = document.getElementById('todoPriority');
        const timeInput = document.getElementById('todoTime');
        const deadlineInput = document.getElementById('todoDeadline');
        const text = input.value.trim();
        const priority = priorityInput.value || 'medium';
        const time = parseFloat(timeInput.value) || 0;
        const deadline = deadlineInput.value || '';
        
        if (text) {
            this.addTodo(text, priority, time, deadline);
            input.value = '';
            priorityInput.value = '';
            timeInput.value = '';
            deadlineInput.value = '';
            input.focus();
        }
    }
}

// アプリケーションの初期化
let todoApp;
document.addEventListener('DOMContentLoaded', () => {
    todoApp = new TodoApp();
});

// キーボードショートカット
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter でタスク追加
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        todoApp.handleAddTodo();
    }
    
    // Escape で入力フィールドをクリア
    if (e.key === 'Escape') {
        document.getElementById('todoInput').value = '';
        document.getElementById('todoInput').blur();
    }
});

// ページ離脱時の警告（未保存の変更がある場合）
window.addEventListener('beforeunload', (e) => {
    const input = document.getElementById('todoInput');
    if (input.value.trim()) {
        e.preventDefault();
        e.returnValue = '入力中のタスクがあります。ページを離れますか？';
    }
});
