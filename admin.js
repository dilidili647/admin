// ==================== SUPABASE 配置 ====================
const SUPABASE_URL = 'https://mubvymfmeumeiijfdxiy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_03_xfgaZmqH2VFLVLO159Q_2x30w1NY';
const TABLE_NAME = 'applications';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// ================================================================

// 管理员账号配置
const ADMIN_ACCOUNTS = {
    'ZHANG': { password: 'zhang123', role: 'admin', name: 'ZHANG' },
    'SUN': { password: 'sun123', role: 'admin', name: 'SUN' },
    'CHENG': { password: 'cheng123', role: 'admin', name: 'CHENG' },
    'admin': { password: 'admin123', role: 'super_admin', name: '超级管理员' }
};

// 全局变量
let currentAdmin = null;
let currentApplicationId = null;
let currentApplicationAssignedAdmin = null;
let debounceTimer = null;
let currentTab = 'normal'; // normal=普通列表 archive=归档列表

// 页面标签切换
function switchTab(tabName) {
    currentTab = tabName;
    // 切换标签样式
    document.getElementById('tab-normal').classList.toggle('border-b-2', tabName === 'normal');
    document.getElementById('tab-normal').classList.toggle('border-primary-500', tabName === 'normal');
    document.getElementById('tab-normal').classList.toggle('text-primary-600', tabName === 'normal');
    document.getElementById('tab-normal').classList.toggle('text-gray-500', tabName !== 'normal');

    document.getElementById('tab-archive').classList.toggle('border-b-2', tabName === 'archive');
    document.getElementById('tab-archive').classList.toggle('border-primary-500', tabName === 'archive');
    document.getElementById('tab-archive').classList.toggle('text-primary-600', tabName === 'archive');
    document.getElementById('tab-archive').classList.toggle('text-gray-500', tabName !== 'archive');

    // 切换容器显示隐藏
    document.getElementById('filter-normal-wrap').classList.toggle('hidden', tabName !== 'normal');
    document.querySelector('.overflow-x-auto').parentElement.classList.toggle('hidden', tabName !== 'normal');
    document.getElementById('empty-state').classList.toggle('hidden', tabName !== 'normal');
    document.getElementById('loading-state').classList.toggle('hidden', tabName !== 'normal');

    document.getElementById('archive-page-wrap').classList.toggle('hidden', tabName !== 'archive');

    reloadCurrentTab();
}

// 刷新当前激活的标签页数据
function reloadCurrentTab() {
    if(currentTab === 'normal') loadApplications();
    if(currentTab === 'archive') loadArchiveList();
}

// 1. 认领分配给自己（带二次确认弹窗）
async function assignToMe() {
    if (!currentApplicationId) return;
    const selfName = currentAdmin.username;
    const confirmRes = confirm(`确认将该申请分配给【${selfName}】？分配后其他人无法操作此单据`);
    if (!confirmRes) return;
    try {
        const { error } = await supabaseClient
            .from(TABLE_NAME)
            .update({
                assigned_admin: selfName,
                status_updated_at: new Date().toISOString()
            })
            .eq('id', currentApplicationId);
        if (error) throw error;
        alert('认领成功！该申请已归属你');
        closeModal();
        reloadCurrentTab();
    } catch (err) {
        alert('认领失败：' + err.message);
    }
}

// 2. 取消分配，恢复未分配（带二次确认弹窗）
async function cancelAssign() {
    if (!currentApplicationId) return;
    const confirmRes = confirm('确认取消分配？此单据将变回未分配，其他管理员可以认领');
    if (!confirmRes) return;
    try {
        const { error } = await supabaseClient
            .from(TABLE_NAME)
            .update({
                assigned_admin: null,
                status_updated_at: new Date().toISOString()
            })
            .eq('id', currentApplicationId);
        if (error) throw error;
        alert('已取消分配，单据回到未分配列表');
        closeModal();
        reloadCurrentTab();
    } catch (err) {
        alert('取消分配失败：' + err.message);
    }
}

// 3. 移入归档库（仅rejected状态可用）
async function moveToArchive() {
    if (!currentApplicationId) return;
    const confirmRes = confirm('确认移入归档库？该人员72小时后将被系统自动永久删除，可手动捞回');
    if (!confirmRes) return;
    try {
        const { error } = await supabaseClient
            .from(TABLE_NAME)
            .update({
                archived_at: new Date().toISOString(),
                status_updated_at: new Date().toISOString()
            })
            .eq('id', currentApplicationId)
            .eq('status', 'rejected');
        if (error) throw error;
        alert('已移入归档库！');
        closeModal();
        reloadCurrentTab();
    } catch (err) {
        alert('移入归档失败：' + err.message);
    }
}

// 4. 归档捞回普通列表
async function pullOutFromArchive(appId) {
    const confirmRes = confirm('确认将此人从归档库捞回普通申请列表？不再自动删除');
    if (!confirmRes) return;
    try {
        const { error } = await supabaseClient
            .from(TABLE_NAME)
            .update({
                archived_at: null,
                status_updated_at: new Date().toISOString()
            })
            .eq('id', appId);
        if (error) throw error;
        alert('捞回成功！');
        reloadCurrentTab();
    } catch (err) {
        alert('捞回失败：' + err.message);
    }
}

// 初始化登录状态检测
function checkLogin() {
    const saved = localStorage.getItem('ajay_admin');
    if (saved) {
        try {
            currentAdmin = JSON.parse(saved);
            showDashboard();
        } catch (e) {
            showLogin();
        }
    } else {
        showLogin();
    }
}

// 切换到登录页面
function showLogin() {
    document.getElementById('login-page').classList.remove('hidden');
    document.getElementById('dashboard-page').classList.add('hidden');
}

// 切换后台仪表盘页面
function showDashboard() {
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('dashboard-page').classList.remove('hidden');
    document.getElementById('current-admin-name').textContent = currentAdmin.name;
    document.getElementById('current-admin-role').textContent = currentAdmin.role === 'super_admin' ? '超级管理员' : '管理员';
    // 仅超级管理员显示手动分配下拉框
    if (currentAdmin.role === 'super_admin') {
        document.getElementById('admin-assign-container').classList.remove('hidden');
    }
    loadApplications();
}

// 登录表单提交监听
document.getElementById('login-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const account = ADMIN_ACCOUNTS[username];
    if (account && account.password === password) {
        currentAdmin = { username, ...account };
        localStorage.setItem('ajay_admin', JSON.stringify(currentAdmin));
        document.getElementById('login-error').classList.add('hidden');
        showDashboard();
    } else {
        document.getElementById('login-error').classList.remove('hidden');
    }
});

// 退出登录
function logout() {
    localStorage.removeItem('ajay_admin');
    currentAdmin = null;
    showLogin();
}

// 【普通列表】加载全部申请 + 全套高级筛选
async function loadApplications() {
    const tbody = document.getElementById('applications-table-body');
    const emptyState = document.getElementById('empty-state');
    const loadingState = document.getElementById('loading-state');
    tbody.innerHTML = '';
    emptyState.classList.add('hidden');
    loadingState.classList.remove('hidden');
    try {
        let query = supabaseClient.from(TABLE_NAME).select('*').order('submitted_at', { ascending: false });
        // 排除归档数据（archived_at不为空的不展示在普通列表）
        query = query.is('archived_at', null);

        // 1.分配管理员筛选
        const adminFilter = document.getElementById('filter-admin').value;
        if (adminFilter !== 'all') {
            if (adminFilter === '') query = query.is('assigned_admin', null);
            else query = query.eq('assigned_admin', adminFilter);
        }
        // 2.主状态筛选
        const mainStatus = document.getElementById('filter-main-status').value;
        if (mainStatus !== 'all') query = query.eq('status', mainStatus);
        // 3.细分状态筛选
        const subStatus = document.getElementById('filter-sub-status').value;
        if (subStatus !== 'all') query = query.eq('sub_status', subStatus);
        // 4.城市地区模糊筛选
        const cityKey = document.getElementById('filter-city').value.trim();
        if (cityKey) query = query.ilike('city_state', `%${cityKey}%`);
        // 5.起止日期筛选
        const dateStart = document.getElementById('filter-date-start').value;
        const dateEnd = document.getElementById('filter-date-end').value;
        if(dateStart) query = query.gte('submitted_at', dateStart);
        if(dateEnd) query = query.lte('submitted_at', dateEnd + ' 23:59:59');
        // 6.关键词模糊搜索（姓名/电话/Telegram）
        const keyword = document.getElementById('filter-keyword').value.trim();
        if (keyword) {
            query = query.or(`full_name.ilike.%${keyword}%,phone_number.ilike.%${keyword}%,telegram_contact.ilike.%${keyword}%`);
        }

        const { data, error } = await query;
        if (error) throw error;
        loadingState.classList.add('hidden');
        if (!data || data.length === 0) {
            emptyState.classList.remove('hidden');
            return;
        }
        updateStats(data);
        // 循环渲染表格行
        data.forEach(app => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50 transition-colors';
            const statusColor = getStatusColor(app.status);
            const submitTime = app.submitted_at ? new Date(app.submitted_at).toLocaleDateString('zh-CN', {
                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
            }) : '-';
            const isUnassigned = app.assigned_admin === null || app.assigned_admin === "";
            const canEditRow = currentAdmin.role === 'super_admin' || app.assigned_admin === currentAdmin.username || isUnassigned;
            row.innerHTML = `
                <td class="px-6 py-4"><p class="font-medium">${escapeHtml(app.full_name)}</p></td>
                <td class="px-6 py-4 text-gray-600">${escapeHtml(app.city_state || '-')}</td>
                <td class="px-6 py-4 text-gray-600">${escapeHtml(app.phone_number || '-')}</td>
                <td class="px-6 py-4 text-gray-600">${escapeHtml(app.telegram_contact || '-')}</td>
                <td class="px-6 py-4">
                    <span class="inline-flex px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                        ${escapeHtml(app.assigned_admin || '未分配')}
                    </span>
                </td>
                <td class="px-6 py-4">
                    <span class="inline-flex px-2 py-1 text-xs font-medium ${statusColor.bg} ${statusColor.text} rounded">
                        ${getStatusLabel(app.status, app.sub_status)}
                    </span>
                </td>
                <td class="px-6 py-4 text-gray-500 text-sm">${submitTime}</td>
                <td class="px-6 py-4">
                    <button onclick="openDetail(${app.id})" class="${canEditRow ? 'text-primary-600' : 'text-gray-400'} font-medium text-sm">
                        ${canEditRow ? '查看/编辑' : '查看'}
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('加载列表失败：', error);
        loadingState.classList.add('hidden');
        tbody.innerHTML = `<tr><td colspan="8" class="px-6 py-8 text-center text-red-500">加载数据失败</td></tr>`;
    }
}

// 【归档列表】加载rejected+archived_at不为空的数据
async function loadArchiveList() {
    const tbody = document.getElementById('archive-table-body');
    const emptyTip = document.getElementById('archive-empty');
    const loadingTip = document.getElementById('archive-loading');
    tbody.innerHTML = '';
    emptyTip.classList.add('hidden');
    loadingTip.classList.remove('hidden');
    try {
        let query = supabaseClient
            .from(TABLE_NAME)
            .select('*')
            .eq('status', 'rejected')
            .not('archived_at', 'is', null)
            .order('archived_at', { ascending: false });
        
        // 归档筛选
        const cityKey = document.getElementById('archive-filter-city').value.trim();
        const keyword = document.getElementById('archive-filter-keyword').value.trim();
        const startDate = document.getElementById('archive-filter-start').value;
        if(cityKey) query = query.ilike('city_state', `%${cityKey}%`);
        if(keyword) query = query.or(`full_name.ilike.%${keyword}%,phone_number.ilike.%${keyword}%`);
        if(startDate) query = query.gte('archived_at', startDate);

        const { data, error } = await query;
        if(error) throw error;
        loadingTip.classList.add('hidden');
        if(!data || data.length === 0) {
            emptyTip.classList.remove('hidden');
            return;
        }
        // 渲染归档表格
        data.forEach(app => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50';
            // 计算剩余删除时间
            const archiveTime = new Date(app.archived_at);
            const expireTime = new Date(archiveTime.getTime() + 72 * 60 * 60 * 1000);
            const now = new Date();
            let remainText = '已过期待清理';
            if(expireTime > now) {
                const diffMs = expireTime - now;
                const h = Math.floor(diffMs / 3600000);
                const m = Math.floor((diffMs % 3600000)/60000);
                remainText = `剩余 ${h}小时${m}分钟`;
            }
            const subLabel = getSubStatusText(app.sub_status);
            const archiveDate = archiveTime.toLocaleString('zh-CN');
            row.innerHTML = `
                <td class="px-6 py-4">${escapeHtml(app.full_name)}</td>
                <td class="px-6 py-4">${escapeHtml(app.city_state || '-')}</td>
                <td class="px-6 py-4">${escapeHtml(app.phone_number || '-')}</td>
                <td class="px-6 py-4">${subLabel}</td>
                <td class="px-6 py-4 text-sm">${archiveDate}</td>
                <td class="px-6 py-4 text-sm text-orange-600">${remainText}</td>
                <td class="px-6 py-4">
                    <button onclick="openDetail(${app.id})" class="text-primary-600 mr-3">查看详情</button>
                    <button onclick="pullOutFromArchive(${app.id})" class="text-green-600">捞回列表</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch(err) {
        loadingTip.classList.add('hidden');
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-500">加载归档失败</td></tr>`;
    }
}

// 更新顶部统计卡片数字
function updateStats(data) {
    document.getElementById('stat-total').textContent = data.length;
    document.getElementById('stat-pending').textContent = data.filter(d => d.status === 'pending' || !d.status).length;
    document.getElementById('stat-approved').textContent = data.filter(d => d.status === 'approved').length;
    document.getElementById('stat-rejected').textContent = data.filter(d => d.status === 'rejected').length;
}

// 获取状态标签样式类
function getStatusColor(status) {
    switch (status) {
        case 'approved': return { bg: 'bg-green-100', text: 'text-green-700' };
        case 'rejected': return { bg: 'bg-red-100', text: 'text-red-700' };
        default: return { bg: 'bg-yellow-100', text: 'text-yellow-700' };
    }
}

// 完整状态文案转换
function getStatusLabel(status, subStatus) {
    if (status === 'approved' && subStatus) {
        const subLabels = {
            'contacting': '联络中', 'no_reply': '没回复', 'preparing': '准备中',
            'probation': '试用期中', 'full_time': '正式工', 'full_time_1mo': '正式工1月+',
            'fired': '已解雇', 'probation_failed': '试用期未过'
        };
        return subLabels[subStatus] || '已通过';
    }
    const labels = { pending: '待审核', approved: '已通过', rejected: '已拒绝' };
    return labels[status] || '待审核';
}

// 仅细分状态文字
function getSubStatusText(subStatus) {
    const map = {
        'contacting': '联络中', 'no_reply': '没回复', 'preparing': '准备中',
        'probation': '试用期中', 'full_time': '正式工', 'full_time_1mo': '正式工1月+',
        'fired': '已解雇', 'probation_failed': '试用期未过'
    };
    return map[subStatus] || '无';
}

// 打开详情弹窗（动态切换认领/取消按钮 + 移入归档按钮显示控制）
async function openDetail(id) {
    currentApplicationId = id;
    try {
        const { data, error } = await supabaseClient.from(TABLE_NAME).select('*').eq('id', id).single();
        if (error) throw error;
        currentApplicationAssignedAdmin = data.assigned_admin;
        const selfName = currentAdmin.username;
        const isUnassigned = data.assigned_admin === null || data.assigned_admin === "";
        const isMine = data.assigned_admin === selfName;
        const canEdit = currentAdmin.role === 'super_admin' || isMine || isUnassigned;
        const isRejected = data.status === 'rejected';

        // 填充基础信息
        document.getElementById('modal-name').textContent = data.full_name;
        document.getElementById('detail-full-name').textContent = data.full_name;
        document.getElementById('detail-city').textContent = data.city_state || '-';
        document.getElementById('detail-phone').textContent = data.phone_number || '-';
        document.getElementById('detail-telegram').textContent = data.telegram_contact || '-';
        document.getElementById('detail-people').textContent = data.people_count || '-';
        document.getElementById('detail-about').textContent = data.about_yourself || '-';
        const submitTime = data.submitted_at ? new Date(data.submitted_at).toLocaleString('zh-CN') : '-';
        document.getElementById('detail-submitted').textContent = submitTime;

        // 显示当前分配人
        if (isUnassigned) {
            document.getElementById('detail-assign-target').textContent = "无（未分配）";
        } else {
            document.getElementById('detail-assign-target').textContent = data.assigned_admin;
        }

        // 动态切换分配/取消按钮
        const btnAssignSelf = document.getElementById('btn-assign-self');
        const btnCancelAssign = document.getElementById('btn-cancel-assign');
        if (isMine || currentAdmin.role === 'super_admin') {
            btnAssignSelf.classList.add('hidden');
            btnCancelAssign.classList.remove('hidden');
        } else if (isUnassigned) {
            btnAssignSelf.classList.remove('hidden');
            btnCancelAssign.classList.add('hidden');
        } else {
            btnAssignSelf.classList.add('hidden');
            btnCancelAssign.classList.add('hidden');
        }

        // 移入归档按钮：仅未通过状态显示
        const btnArchive = document.getElementById('btn-move-archive');
        if(isRejected && canEdit) {
            btnArchive.classList.remove('hidden');
        } else {
            btnArchive.classList.add('hidden');
        }

        // 渲染要求确认列表
        const reqWrap = document.getElementById('detail-requirements');
        const reqMap = {
            'personal-purchases': '个人每日充值 ₹30,000',
            'recruitment': '每日邀请1-3名新用户',
            'team-bonus': '团队每日流水20万，奖励0.5%',
            'bonus-cap': '单日奖励上限 ₹1,000',
            'income-target': '全部达标月入可达 ₹80,000+'
        };
        if (data.confirm_requirements && data.confirm_requirements.length > 0) {
            reqWrap.innerHTML = data.confirm_requirements.map(r => `
                <div class="flex items-center">
                    <svg class="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    <span class="text-gray-700">${reqMap[r] || r}</span>
                </div>`).join('');
        } else reqWrap.innerHTML = '<p class="text-gray-400">未确认</p>';

        // 获客方式标签渲染
        const acqWrap = document.getElementById('detail-acquisition');
        const acqMap = { 'face-to-face': '线下/面对面', 'online-groups': '线上社群', 'both': '两者都有', 'other': '其他' };
        if (data.user_acquisition && data.user_acquisition.length > 0) {
            acqWrap.innerHTML = data.user_acquisition.map(a => `
                <span class="inline-flex px-3 py-1 text-sm font-medium bg-primary-100 text-primary-700 rounded-full">${acqMap[a] || a}</span>`).join('');
        } else acqWrap.innerHTML = '<p class="text-gray-400">-</p>';

        // 其他信息区块控制显示
        if (data.other_info) {
            document.getElementById('other-info-section').classList.remove('hidden');
            document.getElementById('detail-other').textContent = data.other_info;
        } else document.getElementById('other-info-section').classList.add('hidden');

        // 表单下拉赋值
        document.getElementById('detail-status').value = data.status || 'pending';
        document.getElementById('detail-sub-status').value = data.sub_status || '';
        document.getElementById('detail-notes').value = data.admin_notes || '';
        document.getElementById('detail-assigned-admin').value = data.assigned_admin || selfName;
        onStatusChange();

        // 权限控制编辑区/仅查看提示
        if (canEdit) {
            document.getElementById('status-management-section').classList.remove('hidden');
            document.getElementById('no-permission-section').classList.add('hidden');
        } else {
            document.getElementById('status-management-section').classList.add('hidden');
            document.getElementById('no-permission-section').classList.remove('hidden');
        }

        document.getElementById('detail-modal').classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    } catch (error) {
        alert('加载详情失败：' + error.message);
    }
}

// 关闭详情弹窗
function closeModal() {
    document.getElementById('detail-modal').classList.add('hidden');
    document.body.style.overflow = '';
    currentApplicationId = null;
    currentApplicationAssignedAdmin = null;
}

// 主状态切换，控制细分状态下拉显示隐藏
function onStatusChange() {
    const status = document.getElementById('detail-status').value;
    const subWrap = document.getElementById('sub-status-container');
    status === 'approved' ? subWrap.classList.remove('hidden') : subWrap.classList.add('hidden');
}

// 保存修改（带二次确认弹窗，不点确认不提交）
async function saveStatus() {
    if (!currentApplicationId) return;
    const saveBtn = document.getElementById('save-btn');
    const originText = saveBtn.textContent;
    // 二次确认弹窗拦截
    const confirmRes = confirm('确认保存当前状态、备注全部修改？确认后数据永久更新');
    if (!confirmRes) return;
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';
    try {
        const status = document.getElementById('detail-status').value;
        const subStatus = document.getElementById('detail-sub-status').value || null;
        const notes = document.getElementById('detail-notes').value || null;
        const assignAdmin = document.getElementById('detail-assigned-admin').value;
        const updateData = {
            status,
            sub_status: subStatus,
            admin_notes: notes,
            status_updated_at: new Date().toISOString()
        };
        // 仅超级管理员允许修改分配人字段
        if (currentAdmin.role === 'super_admin') updateData.assigned_admin = assignAdmin;
        const { error } = await supabaseClient.from(TABLE_NAME).update(updateData).eq('id', currentApplicationId);
        if (error) throw error;
        alert('修改保存成功！');
        closeModal();
        reloadCurrentTab();
    } catch (err) {
        alert('保存失败：' + err.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = originText;
    }
}

// 搜索输入防抖
function debounceReload() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(reloadCurrentTab, 300);
}

// HTML转义，防止XSS注入漏洞
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 页面加载完成执行登录检测
window.onload = checkLogin;