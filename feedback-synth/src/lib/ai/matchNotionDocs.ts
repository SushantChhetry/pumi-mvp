import { createClient } from '@supabase/supabase-js'
import { OpenAIEmbeddings } from '@langchain/openai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const embeddings = new OpenAIEmbeddings({ modelName: 'text-embedding-3-small' })

export async function matchRelevantDocs(query: string) {
  const queryEmbedding = await embeddings.embedQuery(query)

  const { data, error } = await supabase.rpc('match_notion_docs', {
    query_embedding: queryEmbedding,
    match_count: 3
  })

  if (error) throw new Error(`Vector search failed: ${error.message}`)

  return data || []
}
