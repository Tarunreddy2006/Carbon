// ═══════════════════════════════════════════════════════════════════════════
// CarbonOS — Settings Module
// ═══════════════════════════════════════════════════════════════════════════

const SettingsModule = {
    _container: null,

    async render(container) {
        this._container = container;
        
        container.innerHTML = `
            <div class="page-header animate-fade-in">
                <div class="page-header-left">
                    <h1 class="page-title">Settings</h1>
                    <p class="page-subtitle">Configure your profile settings, team members, billing plan, and preferences.</p>
                </div>
            </div>

            <!-- Tabs Navigation -->
            <div class="tabs animate-fade-up">
                <button class="tab active" data-tab="profile">User Profile</button>
                <button class="tab" data-tab="organization">Organization</button>
                <button class="tab" data-tab="members">Team Members</button>
                <button class="tab" data-tab="appearance">Preferences</button>
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
                    <div class="card-header">
                        <div>
                            <h3 class="card-title">Team Workspace</h3>
                            <p class="card-subtitle" style="margin-top:2px;">User memberships registered within this organization.</p>
                        </div>
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
        await this.loadOrgData();
        await this.loadMembers();
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
        const orgId = Auth.orgId;
        if (!orgId) return;

        try {
            const { data, error } = await supabase
                .from('organizations')
                .select('*')
                .eq('id', orgId)
                .single();

            if (error) throw error;

            document.getElementById('org-display-name').value = data.name || '';
            document.getElementById('org-legal-name').value = data.legal_name || '';
            document.getElementById('org-reg-num').value = data.registration_number || '';
            document.getElementById('org-tax-num').value = data.gst_number || '';
            document.getElementById('org-email').value = data.email || '';
            document.getElementById('org-phone').value = data.phone || '';
            document.getElementById('org-website').value = data.website || '';
            document.getElementById('org-address').value = data.address || '';

            // Form Submit
            const form = document.getElementById('org-settings-form');
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
                    const { error } = await supabase
                        .from('organizations')
                        .update(payload)
                        .eq('id', orgId);

                    if (error) throw error;

                    // Reload cache to sync name in sidebar
                    clearProfileCache();
                    await Auth.guard();
                    Auth.populateUI();

                    Toast.success('Organization details updated');
                } catch (err) {
                    console.error(err);
                    Toast.error('Failed to update organization: ' + err.message);
                } finally {
                    btn.classList.remove('loading');
                    btn.disabled = false;
                }
            });
        } catch (err) {
            console.error('Failed to load org settings:', err);
        }
    },

    async loadMembers() {
        const orgId = Auth.orgId;
        if (!orgId) return;

        try {
            // Read membership rows
            const { data, error } = await supabase
                .from('organization_members')
                .select('*, roles(name), user:profiles(*)')
                .eq('organization_id', orgId);

            if (error) throw error;

            const container = document.getElementById('members-list-container');
            if (!container) return;

            // Map list structure
            const mappedData = data.map(m => {
                const name = m.user ? (m.user.first_name + ' ' + m.user.last_name).trim() : 'Unregistered User';
                const phone = m.user ? m.user.phone || '—' : '—';
                return {
                    name: name || '—',
                    role: m.roles ? m.roles.name : '—',
                    joined_at: m.joined_at,
                    phone: phone
                };
            });

            DataTable.render(container, {
                columns: [
                    { key: 'name', label: 'User Name', sortable: true },
                    { key: 'phone', label: 'Phone', sortable: false },
                    { key: 'role', label: 'Assigned Role', sortable: true, render: (val) => `<span class="badge badge-primary">${val}</span>` },
                    { key: 'joined_at', label: 'Joined At', sortable: true, render: (val) => Utils.formatDate(val) },
                ],
                data: mappedData,
                searchable: false,
                exportable: false,
            });
        } catch (err) {
            console.error('Failed to load members:', err);
            const container = document.getElementById('members-list-container');
            if (container) {
                container.innerHTML = `<div class="text-danger py-4">Failed to load members: ${err.message}</div>`;
            }
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
