import {RedisVectorStore} from "langchain/vectorstores/redis";
import {RetrievalQAChain, VectorDBQAChain} from "langchain/chains";
import {initializeAgentExecutorWithOptions} from "langchain/agents";
import {ChatOpenAI} from "langchain/chat_models/openai";
import {ChainTool} from "langchain/tools";
import {OpenAIEmbeddings} from "langchain/embeddings";
import { BufferMemory} from "langchain/memory";
import { RedisChatMessageHistory} from "langchain/stores/message/redis";




export const convAgent = async (client) => {

  const vectorStore = new RedisVectorStore(new OpenAIEmbeddings(), {
    redisClient: client,
    indexName: "docs",
  });

  const chatHistory = new RedisChatMessageHistory({
        sessionId: "test_session_id",
        sessionTTL: 30000,
        config: {
          url: process.env.REDIS_URL,
        },
  });

  const retrievalChain = VectorDBQAChain.fromLLM(
    new ChatOpenAI({temperature: 0, azureOpenAIApiDeploymentName: "gpt3-hci"}),
    vectorStore,
  );

  const qaTool = new ChainTool({
    name: "group-documents-store",
    description: "Vector Store with group documents - useful for when you need to ask questions about group documents.",
    chain: retrievalChain,
  });

  const tools = [qaTool];
  const model = new ChatOpenAI({temperature: 0, azureOpenAIApiDeploymentName: "gpt3-hci"});

  const bufferMemory = new BufferMemory({
    returnMessages: true,
    memoryKey: "chat_history",
    chatHistory: chatHistory
  });

  const agent =  await initializeAgentExecutorWithOptions(tools, model, {
    agentType: "chat-conversational-react-description",
    verbose: false,
    memory: bufferMemory,
  });

  return agent;
};
