// ═══════════════════════════════════════════════════════════════════════════
// Stomata — Settings Module
// ═══════════════════════════════════════════════════════════════════════════

const SettingsModule = {
    _container: null,

    async render(container) {
        this._container = container;
        
        const isOwnerOrAdmin = typeof Permissions !== 'undefined' && (Permissions.hasRole('Owner') || Permissions.hasRole('Admin'));
        let tabsHtml = `<button class="tab active" data-tab="profile">User Profile</button>`;
        if (isOwnerOrAdmin) {
            tabsHtml += `
                <button class="tab" data-tab="organization">Organization</button>
                <button class="tab" data-tab="members">Users</button>
            `;
        }
        tabsHtml += `<button class="tab" data-tab="appearance">Preferences</button>`;

        container.innerHTML = `
            <div class="page-header animate-fade-in">
                <div class="page-header-left">
                    <h1 class="page-title">Settings</h1>
                    <p class="page-subtitle">Configure your profile settings, team members, billing plan, and preferences.</p>
                </div>
            </div>

            <!-- Tabs Navigation -->
            <div class="tabs animate-fade-up">
                ${tabsHtml}
            </div>

            <!-- Profile Tab -->
            <div class="tab-content active animate-fade-up" id="tab-profile">
                <div class="card" style="max-width: 600px;">
                    <div class="card-header">
                        <h3 class="card-title">Profile Information</h3>
                    </div>
                    <form id="profile-settings-form">
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label" for="profile-first-name">First Name <span class="required">*</span></label>
                                <input type="text" class="form-input" id="profile-first-name" name="first_name" data-validate="required" data-label="First Name" />
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="profile-last-name">Last Name <span class="required">*</span></label>
                                <input type="text" class="form-input" id="profile-last-name" name="last_name" data-validate="required" data-label="Last Name" />
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="profile-phone">Phone Number</label>
                            <input type="text" class="form-input" id="profile-phone" name="phone" data-validate="phone" data-label="Phone Number" />
                        </div>
                        <div class="form-group">
                            <label class="form-label">Email Address</label>
                            <input type="text" class="form-input" id="profile-email-readonly" disabled style="opacity: 0.6; cursor: not-allowed;" />
                            <small class="form-hint">Email address is managed via credentials and cannot be changed here.</small>
                        </div>
                        <div class="flex justify-end mt-4">
                            <button type="submit" class="btn btn-primary" id="save-profile-btn">
                                <span class="btn-text">Save Changes</span>
                                <span class="btn-spinner"></span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- Organization Tab -->
            <div class="tab-content animate-fade-up" id="tab-organization">
                <div class="card" style="max-width: 600px;">
                    <div class="card-header">
                        <h3 class="card-title">Organization Details</h3>
                    </div>
                    <form id="org-settings-form">
                        <div class="form-group">
                            <label class="form-label" for="org-display-name">Company Display Name <span class="required">*</span></label>
                            <input type="text" class="form-input" id="org-display-name" name="name" data-validate="required" data-label="Company Name" />
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="org-legal-name">Legal Registered Name</label>
                            <input type="text" class="form-input" id="org-legal-name" name="legal_name" placeholder="e.g. Acme Biochar Ltd." />
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label" for="org-reg-num">Registration Number</label>
                                <input type="text" class="form-input" id="org-reg-num" name="registration_number" placeholder="e.g. REG-12345" />
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="org-tax-num">Tax / GST Number</label>
                                <input type="text" class="form-input" id="org-tax-num" name="gst_number" placeholder="e.g. GST-998877" />
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="org-email">Business Contact Email</label>
                            <input type="email" class="form-input" id="org-email" name="email" data-validate="email" data-label="Org Email" placeholder="info@company.com" />
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label" for="org-phone">Business Phone</label>
                                <input type="text" class="form-input" id="org-phone" name="phone" data-validate="phone" data-label="Org Phone" />
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="org-website">Website URL</label>
                                <input type="text" class="form-input" id="org-website" name="website" placeholder="https://company.com" />
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="org-address">Street Address</label>
                            <textarea class="form-textarea" id="org-address" name="address" placeholder="123 Pyrolysis Lane"></textarea>
                        </div>
                        <div class="flex justify-end mt-4">
                            <button type="submit" class="btn btn-primary" id="save-org-btn">
                                <span class="btn-text">Save Changes</span>
                                <span class="btn-spinner"></span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- Team Members Tab -->
            <div class="tab-content animate-fade-up" id="tab-members">
                <div class="card">
                    <div class="card-header flex justify-between items-center" style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h3 class="card-title">Users</h3>
                            <p class="card-subtitle" style="margin-top:2px;">Manage user memberships and invitations for this organization.</p>
                        </div>
                        <div id="add-user-btn-container"></div>
                    </div>
                    <div id="members-list-container" class="mt-4">
                        <div class="page-loading">
                            <div class="skeleton skeleton-table"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Preferences Tab -->
            <div class="tab-content animate-fade-up" id="tab-appearance">
                <div class="card" style="max-width: 500px;">
                    <div class="card-header">
                        <h3 class="card-title">Appearance & Theme</h3>
                    </div>
                    <div class="form-group mt-2">
                        <label class="form-label">Theme Preference</label>
                        <div class="flex flex-col gap-2 mt-2">
                            <label class="flex items-center gap-2 cursor-pointer p-3 border rounded border-secondary bg-input">
                                <input type="radio" name="pref-theme" value="dark" />
                                <div>
                                    <div class="font-medium text-primary">Classic Dark Mode</div>
                                    <small>Energy-saving deep background with neon cyan highlights.</small>
                                </div>
                            </label>
                            <label class="flex items-center gap-2 cursor-pointer p-3 border rounded border-secondary bg-input">
                                <input type="radio" name="pref-theme" value="light" />
                                <div>
                                    <div class="font-medium text-primary">Clean Light Mode</div>
                                    <small>Crisp white layout for high-visibility outdoor environments.</small>
                                </div>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Initialize setup
        this.initTabs();
        await this.loadProfileData();
        if (isOwnerOrAdmin) {
            await this.loadOrgData();
            await this.loadMembers();
        }
        this.initPreferenceTab();
    },

    initTabs() {
        const tabs = this._container.querySelectorAll('.tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Remove active classes
                tabs.forEach(t => t.classList.remove('active'));
                this._container.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

                // Add active classes
                tab.classList.add('active');
                const target = tab.dataset.tab;
                document.getElementById(`tab-${target}`).classList.add('active');
            });
        });
    },

    async loadProfileData() {
        const profile = Auth.profile;
        if (!profile) return;

        document.getElementById('profile-first-name').value = profile.first_name || '';
        document.getElementById('profile-last-name').value = profile.last_name || '';
        document.getElementById('profile-phone').value = profile.phone || '';
        document.getElementById('profile-email-readonly').value = Auth.user?.email || '';

        // Form Submit
        const form = document.getElementById('profile-settings-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const { valid } = FormValidator.validate(form);
            if (!valid) return;

            const btn = document.getElementById('save-profile-btn');
            btn.classList.add('loading');
            btn.disabled = true;

            const payload = {
                first_name: document.getElementById('profile-first-name').value.trim(),
                last_name: document.getElementById('profile-last-name').value.trim(),
                phone: document.getElementById('profile-phone').value.trim(),
                updated_at: new Date().toISOString()
            };

            try {
                const { error } = await supabase
                    .from('profiles')
                    .update(payload)
                    .eq('id', Auth.user.id);

                if (error) throw error;

                // Reload profile data cache
                clearProfileCache();
                await Auth.guard(); // refetch
                Auth.populateUI(); // update sidebar/topbar
                Toast.success('Profile updated successfully');
            } catch (err) {
                console.error(err);
                Toast.error('Failed to update profile: ' + err.message);
            } finally {
                btn.classList.remove('loading');
                btn.disabled = false;
            }
        });
    },

    async loadOrgData() {
        let orgId = Auth.orgId || (typeof localStorage !== 'undefined' ? localStorage.getItem('stomata_active_org_id') : null);
        
        // 1. Populate form if org exists
        if (orgId) {
            try {
                const { data } = await OfflineStorage.fetchWithCache('organizations', () => 
                    supabase
                        .from('organizations')
                        .select('*')
                        .eq('id', orgId)
                        .maybeSingle()
                , { isSingle: true, id: orgId });

                if (data) {
                    const nameEl = document.getElementById('org-display-name');
                    if (nameEl) nameEl.value = data.name || '';
                    const legalEl = document.getElementById('org-legal-name');
                    if (legalEl) legalEl.value = data.legal_name || '';
                    const regEl = document.getElementById('org-reg-num');
                    if (regEl) regEl.value = data.registration_number || '';
                    const taxEl = document.getElementById('org-tax-num');
                    if (taxEl) taxEl.value = data.gst_number || '';
                    const emailEl = document.getElementById('org-email');
                    if (emailEl) emailEl.value = data.email || '';
                    const phoneEl = document.getElementById('org-phone');
                    if (phoneEl) phoneEl.value = data.phone || '';
                    const webEl = document.getElementById('org-website');
                    if (webEl) webEl.value = data.website || '';
                    const addrEl = document.getElementById('org-address');
                    if (addrEl) addrEl.value = data.address || '';
                }
            } catch (err) {
                console.warn('[SettingsModule] Failed to populate org details:', err);
            }
        }

        // 2. Always bind Form Submit Listener for Create / Update
        const form = document.getElementById('org-settings-form');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const { valid } = FormValidator.validate(form);
            if (!valid) return;

            const btn = document.getElementById('save-org-btn');
            btn.classList.add('loading');
            btn.disabled = true;

            const payload = {
                name: document.getElementById('org-display-name').value.trim(),
                legal_name: document.getElementById('org-legal-name').value.trim(),
                registration_number: document.getElementById('org-reg-num').value.trim(),
                gst_number: document.getElementById('org-tax-num').value.trim(),
                email: document.getElementById('org-email').value.trim(),
                phone: document.getElementById('org-phone').value.trim(),
                website: document.getElementById('org-website').value.trim(),
                address: document.getElementById('org-address').value.trim(),
                updated_at: new Date().toISOString()
            };

            try {
                let currentOrgId = orgId || Auth.orgId || (typeof localStorage !== 'undefined' ? localStorage.getItem('stomata_active_org_id') : null);
                let existingOrg = null;

                if (currentOrgId && currentOrgId !== '00000000-0000-0000-0000-000000000000' && currentOrgId !== '00000000-0000-0000-0000-000000000001') {
                    const { data } = await supabase
                        .from('organizations')
                        .select('id')
                        .eq('id', currentOrgId)
                        .maybeSingle();
                    existingOrg = data;
                }

                if (existingOrg) {
                    // UPDATE existing organization
                    const { error } = await supabase
                        .from('organizations')
                        .update(payload)
                        .eq('id', currentOrgId);

                    if (error) throw error;
                    Toast.success('Organization details updated successfully');
                } else {
                    // CREATE new organization (INSERT)
                    const newOrgId = (currentOrgId && currentOrgId !== '00000000-0000-0000-0000-000000000000' && currentOrgId !== '00000000-0000-0000-0000-000000000001')
                        ? currentOrgId
                        : ((typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'org-' + Date.now());

                    const createPayload = {
                        id: newOrgId,
                        ...payload,
                        created_at: new Date().toISOString()
                    };

                    const { error: createErr } = await supabase
                        .from('organizations')
                        .insert(createPayload);

                    if (createErr) throw createErr;

                    // Link current user to new organization in profiles and organization_members
                    const user = typeof getUser === 'function' ? await getUser() : (Auth.user || null);
                    if (user && user.id) {
                        try {
                            await supabase
                                .from('profiles')
                                .update({ organization_id: newOrgId })
                                .eq('id', user.id);

                            await supabase
                                .from('organization_members')
                                .insert({
                                    organization_id: newOrgId,
                                    user_id: user.id,
                                    role_id: 1, // Owner
                                    status: 'Active'
                                });
                        } catch (linkErr) {
                            console.warn('[SettingsModule] Org linkage warning:', linkErr);
                        }
                    }

                    if (typeof localStorage !== 'undefined') {
                        localStorage.setItem('stomata_active_org_id', newOrgId);
                    }

                    Toast.success('Organization created successfully');
                }

                // Reload profile cache & update UI context
                if (typeof clearProfileCache === 'function') clearProfileCache();
                if (typeof Auth !== 'undefined' && Auth.guard) await Auth.guard();
                if (typeof Auth !== 'undefined' && Auth.populateUI) Auth.populateUI();

            } catch (err) {
                console.error(err);
                Toast.error('Failed to save organization: ' + err.message);
            } finally {
                btn.classList.remove('loading');
                btn.disabled = false;
            }
        });
    },

    _roles: null,

    async loadMembers() {
        const orgId = Auth.orgId;
        const isValidOrgId = orgId && (typeof Utils !== 'undefined' && Utils.isValidUuid ? Utils.isValidUuid(orgId) : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgId)) && orgId !== '00000000-0000-0000-0000-000000000000';

        try {
            // Load roles if not loaded
            if (!this._roles || this._roles.length === 0) {
                try {
                    const { data: roles, error: rError } = await OfflineStorage.fetchWithCache('roles', () =>
                        supabase
                            .from('roles')
                            .select('*')
                    );
                    if (rError) throw rError;
                    this._roles = roles || [];
                } catch (rErr) {
                    console.warn('[SettingsModule] Failed to fetch roles:', rErr);
                    this._roles = this._roles || [];
                }
            }

            if (!this._roles || this._roles.length === 0) {
                this._roles = [
                    { id: 1, name: 'Owner' },
                    { id: 2, name: 'Admin' },
                    { id: 3, name: 'Project Manager' },
                    { id: 4, name: 'MRV Officer' },
                    { id: 5, name: 'Operator' },
                    { id: 6, name: 'Laboratory' },
                    { id: 7, name: 'Viewer' }
                ];
            }

            const canManageUsers = typeof Permissions !== 'undefined' && Permissions.hasPermission('manage_users');
            const isCurrentUserOwner = typeof Permissions !== 'undefined' && Permissions.hasRole('Owner');
            
            // Populate Add User button container dynamically
            const btnContainer = document.getElementById('add-user-btn-container');
            if (btnContainer) {
                if (canManageUsers) {
                    btnContainer.innerHTML = `<button class="btn btn-primary btn-sm" id="add-user-btn">Add User</button>`;
                    const addBtn = document.getElementById('add-user-btn');
                    if (addBtn) addBtn.onclick = () => this.showAddUserModal();
                } else {
                    btnContainer.innerHTML = '';
                }
            }

            // 1. Read active membership rows safely if valid orgId
            let members = [];
            if (isValidOrgId) {
                try {
                    const { data: mData, error: mError } = await OfflineStorage.fetchWithCache('organization_members', () =>
                        supabase
                            .from('organization_members')
                            .select('*, roles(name), user:profiles(*)')
                            .eq('organization_id', orgId)
                    );

                    if (mError) throw mError;
                    members = (mData || []).filter(m => m && m.organization_id === orgId);
                } catch (mErr) {
                    console.warn('[SettingsModule] Failed to load members:', mErr);
                }
            }

            // 2. Read pending invitations rows safely if valid orgId
            let invitations = [];
            if (isValidOrgId) {
                try {
                    const { data: iData, error: iError } = await OfflineStorage.fetchWithCache('invitations', () =>
                        supabase
                            .from('invitations')
                            .select('*, roles(name)')
                            .eq('organization_id', orgId)
                            .eq('accepted', false)
                    );

                    if (iError) throw iError;
                    invitations = (iData || []).filter(inv => inv && inv.organization_id === orgId && !inv.accepted);
                } catch (iErr) {
                    console.warn('[SettingsModule] Failed to load invitations:', iErr);
                }
            }

            const container = document.getElementById('members-list-container');
            if (!container) return;

            // Map list structure
            const mappedData = [];

            // Add active members
            (members || []).forEach(m => {
                const name = m.user ? (m.user.first_name + ' ' + m.user.last_name).trim() : (m.user_id === Auth.user?.id ? Auth.displayName : 'Member');
                const email = m.user?.email || (m.user_id === Auth.user?.id ? Auth.user.email : '—');
                const roleName = m.roles?.name || (m.role_id === 1 ? 'Owner' : 'Owner');
                mappedData.push({
                    id: m.id,
                    user_id: m.user_id,
                    name: name || '—',
                    email: email,
                    role_id: m.role_id || 1,
                    role_name: roleName,
                    status: 'Active',
                    joined_at: m.joined_at || new Date().toISOString(),
                    is_active: true
                });
            });

            // Ensure current user / organization creator is displayed as Owner if not present in membership list
            if (Auth.user && !mappedData.some(item => item.user_id === Auth.user.id)) {
                const currentName = (Auth.displayName && Auth.displayName !== 'User')
                    ? Auth.displayName
                    : (Auth.profile ? ((Auth.profile.first_name || '') + ' ' + (Auth.profile.last_name || '')).trim() : '') || 'Organization Owner';
                mappedData.unshift({
                    id: 'owner-' + Auth.user.id,
                    user_id: Auth.user.id,
                    name: currentName || 'Organization Owner',
                    email: Auth.user.email || '—',
                    role_id: 1,
                    role_name: 'Owner',
                    status: 'Active',
                    joined_at: Auth.profile?.created_at || new Date().toISOString(),
                    is_active: true
                });
            }

            // Add pending invitations
            (invitations || []).forEach(inv => {
                mappedData.push({
                    id: inv.id,
                    user_id: null,
                    name: '—',
                    email: inv.email,
                    role_id: inv.role_id,
                    role_name: inv.roles ? inv.roles.name : '—',
                    status: 'Pending',
                    joined_at: inv.created_at,
                    is_active: false
                });
            });

            const columns = [
                { key: 'name', label: 'User Name', sortable: true },
                { key: 'email', label: 'Email', sortable: true },
                { 
                    key: 'role_name', 
                    label: 'Assigned Role', 
                    sortable: true,
                    render: (val, row) => {
                        const targetIsOwner = row.role_name === 'Owner';
                        // Render dropdown if has manage_users permission, and not self, and the target is not Owner (unless current user is Owner)
                        if (canManageUsers && row.user_id !== Auth.user.id && (!targetIsOwner || isCurrentUserOwner)) {
                            // Filter roles: if current user is not Owner, exclude Owner from selection options
                            const allowedRoles = isCurrentUserOwner ? this._roles : this._roles.filter(r => r.name !== 'Owner');
                            return `
                                <select class="form-select select-sm role-change-select" style="padding: 2px 8px; font-size: 0.85rem; height: auto; width: auto;" data-id="${row.id}" data-is-active="${row.is_active}">
                                    ${allowedRoles.map(r => `<option value="${r.id}" ${r.id === row.role_id ? 'selected' : ''}>${r.name}</option>`).join('')}
                                </select>
                            `;
                        } else {
                            return `<span class="badge badge-primary">${val}</span>`;
                        }
                    }
                },
                { 
                    key: 'status', 
                    label: 'Status', 
                    sortable: true,
                    render: (val) => {
                        const badgeClass = val === 'Active' ? 'badge-success' : 'badge-warning';
                        return `<span class="badge ${badgeClass}">${val}</span>`;
                    }
                }
            ];

            if (canManageUsers) {
                columns.push({
                    key: 'actions',
                    label: 'Actions',
                    sortable: false,
                    render: (val, row) => {
                        if (row.user_id === Auth.user.id) return '—';
                        const targetIsOwner = row.role_name === 'Owner';
                        if (targetIsOwner && !isCurrentUserOwner) return '—'; // Admin cannot remove Owner
                        return `
                            <button class="btn btn-danger btn-sm remove-member-btn" style="padding: 2px 8px; font-size: 0.8rem; height: auto;" data-id="${row.id}" data-is-active="${row.is_active}" data-email="${row.email}">
                                Remove
                            </button>
                        `;
                    }
                });
            }

            DataTable.render(container, {
                columns: columns,
                data: mappedData,
                searchable: false,
                exportable: false,
            });

            // Clean existing event listeners by replacing with fresh event handlers
            container.onchange = null;
            container.onchange = async (e) => {
                if (e.target.classList.contains('role-change-select')) {
                    const id = e.target.dataset.id;
                    const isActive = e.target.dataset.isActive === 'true';
                    const newRoleId = Number(e.target.value);
                    await this.changeUserRole(id, isActive, newRoleId);
                }
            };

            container.onclick = null;
            container.onclick = async (e) => {
                if (e.target.classList.contains('remove-member-btn')) {
                    const id = e.target.dataset.id;
                    const isActive = e.target.dataset.isActive === 'true';
                    const email = e.target.dataset.email;
                    await this.removeUser(id, isActive, email);
                }
            };

        } catch (err) {
            console.error('Failed to load members:', err);
            const container = document.getElementById('members-list-container');
            if (container) {
                container.innerHTML = `<div class="text-danger py-4">Failed to load members: ${err.message}</div>`;
            }
        }
    },

    showAddUserModal() {
        if (!this._roles) return;

        const isCurrentUserOwner = typeof Permissions !== 'undefined' && Permissions.hasRole('Owner');
        const allowedRoles = isCurrentUserOwner ? this._roles : this._roles.filter(r => r.name !== 'Owner');

        const html = `
            <div class="modal-header">
                <h3 class="modal-title">Add User</h3>
            </div>
            <form id="add-user-form">
                <div class="modal-body">
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label" for="add-first-name">First Name</label>
                            <input type="text" class="form-input" id="add-first-name" placeholder="First Name" />
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="add-last-name">Last Name</label>
                            <input type="text" class="form-input" id="add-last-name" placeholder="Last Name" />
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="add-email">Email <span class="required">*</span></label>
                        <input type="email" class="form-input" id="add-email" required placeholder="email@company.com" />
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="add-role">Role <span class="required">*</span></label>
                        <select class="form-select" id="add-role" required>
                            ${allowedRoles.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-ghost" id="add-user-cancel-btn">Cancel</button>
                    <button type="submit" class="btn btn-primary" id="save-user-btn">
                        <span class="btn-text">Add User</span>
                        <span class="btn-spinner"></span>
                    </button>
                </div>
            </form>
        `;

        Modal.open(html, { width: '480px' });

        document.getElementById('add-user-cancel-btn').addEventListener('click', () => Modal.close());

        const form = document.getElementById('add-user-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('save-user-btn');
            btn.classList.add('loading');
            btn.disabled = true;

            const email = document.getElementById('add-email').value.trim();
            const roleId = Number(document.getElementById('add-role').value);

            try {
                const orgId = Auth.orgId;
                const isValidOrgId = orgId && (typeof Utils !== 'undefined' && Utils.isValidUuid ? Utils.isValidUuid(orgId) : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgId)) && orgId !== '00000000-0000-0000-0000-000000000000';
                if (!isValidOrgId) {
                    throw new Error('Valid organization context is required to invite users.');
                }
                const token = (typeof Utils !== 'undefined' && Utils.uuid) ? Utils.uuid() : crypto.randomUUID();

                // Store invitation record using invitations table
                const { error } = await supabase
                    .from('invitations')
                    .insert({
                        organization_id: orgId,
                        email: email,
                        role_id: roleId,
                        invited_by: Auth.user.id,
                        token: token,
                        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                        accepted: false
                    });

                if (error) throw error;

                Toast.success('User invited successfully');
                Modal.close();
                await this.loadMembers();
            } catch (err) {
                console.error('Failed to add user:', err);
                Toast.error('Failed to add user: ' + err.message);
            } finally {
                btn.classList.remove('loading');
                btn.disabled = false;
            }
        });
    },

    async changeUserRole(id, isActive, newRoleId) {
        try {
            if (isActive) {
                const { error } = await supabase
                    .from('organization_members')
                    .update({ role_id: newRoleId })
                    .eq('id', id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('invitations')
                    .update({ role_id: newRoleId })
                    .eq('id', id);
                if (error) throw error;
            }
            Toast.success('User role updated successfully');
            await this.loadMembers();
        } catch (err) {
            console.error('Failed to update role:', err);
            Toast.error('Failed to update role: ' + err.message);
        }
    },

    async removeUser(id, isActive, email) {
        const confirm = await Modal.confirm(
            'Remove User',
            `Are you sure you want to remove ${email} from this organization?`
        );
        if (!confirm) return;

        try {
            if (isActive) {
                const { error } = await supabase
                    .from('organization_members')
                    .delete()
                    .eq('id', id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('invitations')
                    .delete()
                    .eq('id', id);
                if (error) throw error;
            }
            Toast.success('User removed successfully');
            await this.loadMembers();
        } catch (err) {
            console.error('Failed to remove user:', err);
            Toast.error('Failed to remove user: ' + err.message);
        }
    },

    initPreferenceTab() {
        const radios = this._container.querySelectorAll('input[name="pref-theme"]');
        const current = Theme.current();

        radios.forEach(radio => {
            if (radio.value === current) radio.checked = true;

            radio.addEventListener('change', (e) => {
                const target = e.target.value;
                Theme.apply(target);
                Toast.success(`Theme switched to ${target} mode`);
            });
        });
    }
};

if (typeof window !== 'undefined') {
    window.SettingsModule = SettingsModule;
}
