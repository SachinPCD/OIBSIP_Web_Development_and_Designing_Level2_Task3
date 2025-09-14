class TodoApp {
    constructor() {
        this.tasks = [];
        this.currentFilter = 'all';
        this.searchQuery = '';
        this.undoStack = [];
        this.isDarkMode = false;
        
        this.init();
    }

    init() {
        this.loadFromStorage();
        this.setupEventListeners();
        this.render();
        this.updateStats();
        this.initTheme();
        setTimeout(() => {
            document.getElementById('taskInput').focus();
        }, 100);
    }

    setupEventListeners() {
        const taskInput = document.getElementById('taskInput');
        const addTaskBtn = document.getElementById('addTaskBtn');
        
        taskInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addTask();
            }
        });
        
        taskInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                taskInput.value = '';
                taskInput.blur();
            }
        });

        addTaskBtn.addEventListener('click', () => this.addTask());
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.setFilter(e.target.dataset.filter);
            });
        });

        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.render();
        });

        document.getElementById('markAllBtn').addEventListener('click', () => {
            this.toggleAllTasks();
        });

        document.getElementById('clearCompletedBtn').addEventListener('click', () => {
            this.showConfirmModal(
                'Clear Completed Tasks',
                'Are you sure you want to delete all completed tasks? This action cannot be undone.',
                () => this.clearCompleted()
            );
        });

        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportTasks();
        });

        document.getElementById('undoBtn').addEventListener('click', () => {
            this.undo();
        });
        document.getElementById('themeToggle').addEventListener('click', () => {
            this.toggleTheme();
        });
        const taskList = document.getElementById('taskList');
        taskList.addEventListener('click', this.handleTaskClick.bind(this));
        taskList.addEventListener('dblclick', this.handleTaskDoubleClick.bind(this));
        taskList.addEventListener('keydown', this.handleTaskKeydown.bind(this));

        taskList.addEventListener('dragstart', this.handleDragStart.bind(this));
        taskList.addEventListener('dragover', this.handleDragOver.bind(this));
        taskList.addEventListener('drop', this.handleDrop.bind(this));
        taskList.addEventListener('dragend', this.handleDragEnd.bind(this));

        // Modal events
        document.getElementById('modalCancel').addEventListener('click', () => {
            this.hideModal();
        });

        document.getElementById('modalConfirm').addEventListener('click', () => {
            if (this.modalCallback) {
                this.modalCallback();
            }
            this.hideModal();
        });
        document.getElementById('toastClose').addEventListener('click', () => {
            this.hideToast();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' && e.target.closest('.task-item')) {
                e.preventDefault();
                const taskId = e.target.closest('.task-item').dataset.taskId;
                this.deleteTask(taskId);
            }
        });

        window.addEventListener('beforeunload', () => {
            this.saveToStorage();
        });
    }

    addTask() {
        const taskInput = document.getElementById('taskInput');
        const prioritySelect = document.getElementById('prioritySelect');
        const dueDateInput = document.getElementById('dueDateInput');
        
        const text = taskInput.value.trim();
        
        if (!text) {
            this.showToast('Please enter a task description', 'error');
            taskInput.focus();
            return;
        }

        if (text.length > 200) {
            this.showToast('Task description is too long (max 200 characters)', 'error');
            return;
        }

        const task = {
            id: Date.now().toString(),
            text: text,
            completed: false,
            priority: prioritySelect.value,
            dueDate: dueDateInput.value || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.saveState();
        this.tasks.unshift(task);
        
        taskInput.value = '';
        dueDateInput.value = '';
        prioritySelect.value = 'medium';
    
        setTimeout(() => taskInput.focus(), 50);
        
        this.saveToStorage();
        this.render();
        this.updateStats();
        this.showToast('Task added successfully!', 'success');
        
        this.checkMilestones();
    }

    deleteTask(taskId) {
        this.saveState();
        const taskIndex = this.tasks.findIndex(task => task.id === taskId);
        
        if (taskIndex !== -1) {
            const deletedTask = this.tasks[taskIndex];
            this.tasks.splice(taskIndex, 1);
            this.saveToStorage();
            this.render();
            this.updateStats();
            this.showToast(`Task "${deletedTask.text}" deleted`, 'info');
        }
    }

    toggleTask(taskId) {
        this.saveState();
        const task = this.tasks.find(task => task.id === taskId);
        
        if (task) {
            task.completed = !task.completed;
            task.updatedAt = new Date().toISOString();
            this.saveToStorage();
            this.render();
            this.updateStats();
            
            const status = task.completed ? 'completed' : 'marked as active';
            this.showToast(`Task ${status}`, 'success');
            if (task.completed) {
                this.checkMilestones();
            }
        }
    }

    editTask(taskId, newText) {
        const task = this.tasks.find(task => task.id === taskId);
        
        if (task && newText.trim() && newText.trim() !== task.text) {
            this.saveState();
            task.text = newText.trim();
            task.updatedAt = new Date().toISOString();
            this.saveToStorage();
            this.render();
            this.updateStats();
            this.showToast('Task updated successfully!', 'success');
        }
    }

    setFilter(filter) {
        this.currentFilter = filter;
        
        // Update active tab
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-filter="${filter}"]`).classList.add('active');
        
        this.render();
    }

    getFilteredTasks() {
        let filtered = [...this.tasks];
        
        // Apply status filter
        switch (this.currentFilter) {
            case 'active':
                filtered = filtered.filter(task => !task.completed);
                break;
            case 'completed':
                filtered = filtered.filter(task => task.completed);
                break;
        }
        
        // Apply search filter
        if (this.searchQuery) {
            filtered = filtered.filter(task => 
                task.text.toLowerCase().includes(this.searchQuery)
            );
        }
        
        return filtered;
    }

    render() {
        const taskList = document.getElementById('taskList');
        const emptyState = document.getElementById('emptyState');
        const filteredTasks = this.getFilteredTasks();
        
        if (filteredTasks.length === 0) {
            taskList.style.display = 'none';
            emptyState.style.display = 'block';
        } else {
            taskList.style.display = 'flex';
            emptyState.style.display = 'none';
        }
        
        taskList.innerHTML = filteredTasks.map(task => this.createTaskHTML(task)).join('');
        this.updateBulkActionButtons();
    }

    createTaskHTML(task) {
        const dueDate = task.dueDate ? new Date(task.dueDate) : null;
        const isOverdue = dueDate && dueDate < new Date() && !task.completed;
        const dueDateText = dueDate ? dueDate.toLocaleDateString() : '';
        
        return `
            <div class="task-item ${task.completed ? 'completed' : ''}" 
                 data-task-id="${task.id}" 
                 draggable="true">
                <div class="task-checkbox ${task.completed ? 'checked' : ''}" 
                     data-action="toggle"></div>
                <div class="task-content">
                    <div class="task-text" data-action="edit">${this.escapeHtml(task.text)}</div>
                    <div class="task-meta">
                        <span class="task-priority ${task.priority}">
                            ${this.getPriorityIcon(task.priority)} ${task.priority}
                        </span>
                        ${task.dueDate ? `<span class="task-due-date ${isOverdue ? 'overdue' : ''}">
                            📅 ${dueDateText}${isOverdue ? ' (Overdue)' : ''}
                        </span>` : ''}
                    </div>
                </div>
                <div class="task-actions">
                    <button class="task-action-btn edit-btn" data-action="edit" title="Edit task">
                        ✏️
                    </button>
                    <button class="task-action-btn delete-btn" data-action="delete" title="Delete task">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    }

    getPriorityIcon(priority) {
        const icons = {
            high: '🔴',
            medium: '🟡',
            low: '🟢'
        };
        return icons[priority] || '⚪';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    handleTaskClick(e) {
        const taskItem = e.target.closest('.task-item');
        if (!taskItem) return;
        
        const taskId = taskItem.dataset.taskId;
        const action = e.target.dataset.action;
        
        e.stopPropagation();
        
        switch (action) {
            case 'toggle':
                this.toggleTask(taskId);
                break;
            case 'delete':
                this.deleteTask(taskId);
                break;
            case 'edit':
                this.startEditingTask(taskItem);
                break;
        }
    }

    handleTaskDoubleClick(e) {
        const taskItem = e.target.closest('.task-item');
        if (taskItem && (e.target.classList.contains('task-text') || e.target.classList.contains('task-content'))) {
            e.preventDefault();
            this.startEditingTask(taskItem);
        }
    }

    handleTaskKeydown(e) {
        if (e.target.classList.contains('task-text') && e.target.contentEditable === 'true') {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.finishEditingTask(e.target);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.cancelEditingTask(e.target);
            }
        }
    }

    startEditingTask(taskItem) {
        const taskText = taskItem.querySelector('.task-text');
        const originalText = taskText.textContent;
        
        taskText.contentEditable = true;
        taskText.classList.add('editing');
        taskText.dataset.originalText = originalText;
        taskText.focus();
        
        // Select all text
        const range = document.createRange();
        range.selectNodeContents(taskText);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }

    finishEditingTask(taskTextElement) {
        const taskId = taskTextElement.closest('.task-item').dataset.taskId;
        const newText = taskTextElement.textContent.trim();
        
        taskTextElement.contentEditable = false;
        taskTextElement.classList.remove('editing');
        
        if (newText && newText !== taskTextElement.dataset.originalText) {
            this.editTask(taskId, newText);
        } else {
            taskTextElement.textContent = taskTextElement.dataset.originalText;
        }
        
        delete taskTextElement.dataset.originalText;
    }

    cancelEditingTask(taskTextElement) {
        taskTextElement.contentEditable = false;
        taskTextElement.classList.remove('editing');
        taskTextElement.textContent = taskTextElement.dataset.originalText;
        delete taskTextElement.dataset.originalText;
    }

    // Drag and Drop functionality
    handleDragStart(e) {
        if (e.target.classList.contains('task-item')) {
            e.target.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', e.target.dataset.taskId);
        }
    }

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        const draggingItem = document.querySelector('.dragging');
        const taskList = document.getElementById('taskList');
        const afterElement = this.getDragAfterElement(taskList, e.clientY);
        
        if (afterElement == null) {
            taskList.appendChild(draggingItem);
        } else {
            taskList.insertBefore(draggingItem, afterElement);
        }
    }

    handleDrop(e) {
        e.preventDefault();
        const draggedTaskId = e.dataTransfer.getData('text/html');
        this.reorderTask(draggedTaskId);
    }

    handleDragEnd(e) {
        if (e.target.classList.contains('task-item')) {
            e.target.classList.remove('dragging');
        }
    }

    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.task-item:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    reorderTask(draggedTaskId) {
        const taskItems = Array.from(document.querySelectorAll('.task-item'));
        const newOrder = taskItems.map(item => item.dataset.taskId);
        
        // Reorder tasks array to match DOM order
        this.saveState();
        const reorderedTasks = [];
        newOrder.forEach(id => {
            const task = this.tasks.find(t => t.id === id);
            if (task) reorderedTasks.push(task);
        });
        
        this.tasks = reorderedTasks;
        this.saveToStorage();
        this.showToast('Task order updated', 'info');
    }

    toggleAllTasks() {
        const activeTasks = this.tasks.filter(task => !task.completed);
        const allCompleted = activeTasks.length === 0;
        
        this.saveState();
        
        if (allCompleted) {
            // Mark all as active
            this.tasks.forEach(task => {
                task.completed = false;
                task.updatedAt = new Date().toISOString();
            });
            this.showToast('All tasks marked as active', 'info');
        } else {
            // Mark all as complete
            this.tasks.forEach(task => {
                task.completed = true;
                task.updatedAt = new Date().toISOString();
            });
            this.showToast('All tasks marked as complete', 'success');
        }
        
        this.saveToStorage();
        this.render();
        this.updateStats();
    }

    clearCompleted() {
        this.saveState();
        const completedCount = this.tasks.filter(task => task.completed).length;
        this.tasks = this.tasks.filter(task => !task.completed);
        this.saveToStorage();
        this.render();
        this.updateStats();
        this.showToast(`${completedCount} completed tasks cleared`, 'info');
    }

    updateStats() {
        const total = this.tasks.length;
        const completed = this.tasks.filter(task => task.completed).length;
        const active = total - completed;
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
        
        // Update the DOM elements
        document.getElementById('totalTasks').textContent = total;
        document.getElementById('activeTasks').textContent = active;
        document.getElementById('completedTasks').textContent = completed;
        document.getElementById('progressFill').style.width = `${percentage}%`;
        document.getElementById('progressText').textContent = `${percentage}% Complete`;
        
        // Update bulk action buttons
        this.updateBulkActionButtons();
    }

    updateBulkActionButtons() {
        const markAllBtn = document.getElementById('markAllBtn');
        const clearCompletedBtn = document.getElementById('clearCompletedBtn');
        const undoBtn = document.getElementById('undoBtn');
        
        const activeTasks = this.tasks.filter(task => !task.completed);
        const completedTasks = this.tasks.filter(task => task.completed);
        
        markAllBtn.textContent = activeTasks.length === 0 ? 'Mark All Active' : 'Mark All Complete';
        markAllBtn.disabled = this.tasks.length === 0;
        
        clearCompletedBtn.disabled = completedTasks.length === 0;
        undoBtn.disabled = this.undoStack.length === 0;
    }

    exportTasks() {
        const exportData = {
            tasks: this.tasks,
            exportDate: new Date().toISOString(),
            totalTasks: this.tasks.length,
            completedTasks: this.tasks.filter(task => task.completed).length
        };
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `todo-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        this.showToast('Tasks exported successfully!', 'success');
    }

    // State management for undo functionality
    saveState() {
        const state = JSON.stringify(this.tasks);
        this.undoStack.push(state);
        
        // Limit undo stack to 10 actions
        if (this.undoStack.length > 10) {
            this.undoStack.shift();
        }
    }

    undo() {
        if (this.undoStack.length > 0) {
            const previousState = this.undoStack.pop();
            this.tasks = JSON.parse(previousState);
            this.saveToStorage();
            this.render();
            this.updateStats();
            this.showToast('Last action undone', 'info');
        }
    }

    // Theme functionality
    initTheme() {
        const savedTheme = localStorage.getItem('todoTheme');
        if (savedTheme) {
            this.isDarkMode = savedTheme === 'dark';
        } else {
            this.isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        this.applyTheme();
    }

    toggleTheme() {
        this.isDarkMode = !this.isDarkMode;
        this.applyTheme();
        localStorage.setItem('todoTheme', this.isDarkMode ? 'dark' : 'light');
        this.showToast(`Switched to ${this.isDarkMode ? 'dark' : 'light'} theme`, 'info');
    }

    applyTheme() {
        const themeToggle = document.getElementById('themeToggle');
        const themeIcon = themeToggle.querySelector('.theme-icon');
        
        if (this.isDarkMode) {
            document.documentElement.setAttribute('data-color-scheme', 'dark');
            themeIcon.textContent = '☀️';
            themeToggle.setAttribute('title', 'Switch to light mode');
        } else {
            document.documentElement.setAttribute('data-color-scheme', 'light');
            themeIcon.textContent = '🌙';
            themeToggle.setAttribute('title', 'Switch to dark mode');
        }
    }

    // Modal functionality
    showConfirmModal(title, message, callback) {
        const modal = document.getElementById('confirmModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalMessage = document.getElementById('modalMessage');
        
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        this.modalCallback = callback;
        
        modal.classList.remove('hidden');
        
        // Focus on confirm button for accessibility
        setTimeout(() => {
            document.getElementById('modalConfirm').focus();
        }, 100);
    }

    hideModal() {
        const modal = document.getElementById('confirmModal');
        modal.classList.add('hidden');
        this.modalCallback = null;
    }

    // Toast notification functionality
    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toastMessage');
        
        toastMessage.textContent = message;
        toast.className = `toast`;
        toast.classList.remove('hidden');
        
        // Auto hide after 3 seconds
        clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            this.hideToast();
        }, 3000);
    }

    hideToast() {
        const toast = document.getElementById('toast');
        toast.classList.add('hidden');
        clearTimeout(this.toastTimeout);
    }

    // Motivational milestones
    checkMilestones() {
        const completedCount = this.tasks.filter(task => task.completed).length;
        const milestones = {
            5: "🎉 Great start! You've completed 5 tasks!",
            10: "🚀 Amazing! 10 tasks completed - you're on fire!",
            25: "🌟 Incredible! 25 tasks done - you're a productivity superstar!",
            50: "🏆 Outstanding! 50 tasks completed - you're unstoppable!",
            100: "👑 Legendary! 100 tasks completed - you're the task master!"
        };
        
        if (milestones[completedCount]) {
            setTimeout(() => {
                this.showToast(milestones[completedCount], 'success');
            }, 500);
        }
    }

    // Local Storage functionality
    saveToStorage() {
        try {
            localStorage.setItem('todoTasks', JSON.stringify(this.tasks));
        } catch (error) {
            console.error('Failed to save to localStorage:', error);
            this.showToast('Failed to save tasks', 'error');
        }
    }

    loadFromStorage() {
        try {
            const saved = localStorage.getItem('todoTasks');
            if (saved) {
                this.tasks = JSON.parse(saved);
            }
        } catch (error) {
            console.error('Failed to load from localStorage:', error);
            this.tasks = [];
            this.showToast('Failed to load saved tasks', 'error');
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.todoApp = new TodoApp();
});

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TodoApp;
}