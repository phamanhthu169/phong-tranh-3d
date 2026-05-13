import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://ejdzwaekpejmfajfnccl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqZHp3YWVrcGVqbWZhamZuY2NsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MDgyNDYsImV4cCI6MjA5MzE4NDI0Nn0.69bZ3hQcCuhEPmy-Pi4Phou6OhCrbNIR7kuPR1yfr1I'
);

export const STORAGE_BUCKET = 'patbk';
export const GALLERY_NAME   = 'main';
