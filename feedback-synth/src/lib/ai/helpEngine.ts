// src/lib/ai/helpEngine.ts
import { createClient } from '@supabase/supabase-js'
import { OpenAIEmbeddings } from '@langchain/openai' // Updated import
import { ChatOpenAI } from '@langchain/openai' // Updated import
import { PromptTemplate } from '@langchain/core/prompts' // Updated import
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase'


const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const embeddings = new OpenAIEmbeddings({ 
  modelName: 'text-embedding-3-small',
  openAIApiKey: process.env.OPENAI_API_KEY // Ensure this is set
})

const llm = new ChatOpenAI({ 
  modelName: 'gpt-4',
  temperature: 0,
  openAIApiKey: process.env.OPENAI_API_KEY // Ensure this is set
})

const template = `You are a helpful assistant for the PuMi Slack bot. Use the context below to answer the user's question. If the answer cannot be found in the context, say "I'm not sure, but we'll get back to you.".

Context:
{context}

Question: {question}`

const prompt = PromptTemplate.fromTemplate(template)

export async function getHelpAnswer(question: string): Promise<string> {
  try {
    // Check Supabase cache
    const { data: cached } = await supabase
      .from('pumi_help_cache')
      .select('answer')
      .eq('question', question)
      .maybeSingle()

    if (cached?.answer) {
      return cached.answer
    }

    // Embed and search Notion-based vector store
    const vectorStore = await SupabaseVectorStore.fromExistingIndex(
      embeddings,
      {
        client: supabase,
        tableName: 'notion_help_docs',
        queryName: 'match_notion_docs'
      }
    )

    const results = await vectorStore.similaritySearch(question, 4)
    const context = results.map(r => r.pageContent).join('\n\n')

    const chain = prompt.pipe(llm)
    const response = await chain.invoke({ context, question })

    // Cache response
    await supabase.from('pumi_help_cache').insert({
      question,
      answer: response.content
    })

    return response.content.toString()
  } catch (error) {
    console.error('Error in getHelpAnswer:', error)
    return "I'm having trouble answering that right now. Please try again later."
  }
}