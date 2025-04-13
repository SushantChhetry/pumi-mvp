import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Initialize
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
if (!supabaseUrl || !supabaseKey) throw new Error('Missing Supabase credentials')
const supabase = createClient(supabaseUrl, supabaseKey)

serve(async (_req) => {
  try {
    // Fetch recent messages
    const { data: messages, error } = await supabase
      .from('user_feedback_messages')
      .select('*')
      .gte('created_at', new Date(Date.now() - 60_000).toISOString())

    if (error) throw error

    // TODO: Implement summarization
    // const summary = await summarize(messages.map(m => m.text))

    return new Response(
      JSON.stringify({ 
        success: true,
        message_count: messages.length,
        // summary 
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Error:', err)
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})