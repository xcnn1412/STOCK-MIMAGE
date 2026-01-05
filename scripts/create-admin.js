require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createAdmin() {
  const phone = '0123456789';
  
  // Check if exists
  const { data: existing } = await supabase
    .from('profiles')
    .select('*')
    .eq('phone', phone)
    .single();

  if (existing) {
    console.log('User already exists:', existing);
    return;
  }

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      full_name: 'Admin User',
      phone: phone,
      role: 'admin'
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating user:', error);
  } else {
    console.log('Admin user created successfully:', data);
  }
}

createAdmin();
