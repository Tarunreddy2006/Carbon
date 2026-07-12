CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name TEXT NOT NULL,
    legal_name TEXT,
    registration_number TEXT,
    gst_number TEXT,

    email TEXT,
    phone TEXT,
    website TEXT,

    address TEXT,
    city TEXT,
    state TEXT,
    country TEXT,

    logo_url TEXT,

    subscription_plan TEXT DEFAULT 'Free',
    subscription_status TEXT DEFAULT 'Active',

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE profiles (

    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    first_name TEXT,

    last_name TEXT,

    phone TEXT,

    avatar_url TEXT,

    organization_id UUID REFERENCES organizations(id),

    created_at TIMESTAMPTZ DEFAULT now(),

    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE roles (

    id SERIAL PRIMARY KEY,

    name TEXT UNIQUE NOT NULL,

    description TEXT
);
INSERT INTO roles(name,description)
VALUES

('Owner','Organization owner'),

('Admin','Administrator'),

('Project Manager','Manages projects'),

('Operator','Operates plant'),

('Auditor','Internal auditor'),

('Viewer','Read only');
CREATE TABLE organization_members (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

    role_id INT REFERENCES roles(id),

    invited_by UUID REFERENCES auth.users(id),

    joined_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE (organization_id,user_id)
);
CREATE TABLE invitations (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organization_id UUID REFERENCES organizations(id),

    email TEXT,

    role_id INT REFERENCES roles(id),

    invited_by UUID REFERENCES auth.users(id),

    token TEXT,

    expires_at TIMESTAMPTZ,

    accepted BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
ON profiles
FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
ON profiles
FOR UPDATE
USING (auth.uid() = id);
