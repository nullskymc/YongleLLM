import { defineStore } from 'pinia'
import neo4j from 'neo4j-driver'

export const useNeo4jStore = defineStore('neo4j', {  state: () => ({
    driver: null,
    connected: false,
    connecting: false,
    loading: false,
    error: null,
    config: {
      uri: 'neo4j+s://ebe0de13.databases.neo4j.io',
      username: 'neo4j',
      password: 'da64KewjnSxC8GJV__j8jH3XBGsvuugZrzGEj36CnsQ'
    }
  }),

  actions: {    async connect() {
      // 如果已经连接或正在连接，直接返回
      if (this.connected || this.connecting) {
        return this.connected
      }

      try {
        this.connecting = true
        this.loading = true
        this.error = null

        this.driver = neo4j.driver(
          this.config.uri,
          neo4j.auth.basic(this.config.username, this.config.password)
        )

        // 测试连接
        await this.driver.verifyConnectivity()
        this.connected = true
        
        console.log('Successfully connected to Neo4j')
        
        // 自动运行调试检查
        setTimeout(() => {
          this.debugConnection()
        }, 1000)
        
        return true
      } catch (error) {
        this.error = error.message
        this.connected = false
        console.error('Failed to connect to Neo4j:', error)
        return false
      } finally {
        this.connecting = false
        this.loading = false
      }
    },

    async disconnect() {
      try {
        if (this.driver) {
          await this.driver.close()
          this.driver = null
        }
        this.connected = false
      } catch (error) {
        console.error('Error disconnecting from Neo4j:', error)
      }
    },    async runQuery(query, params = {}) {
      // 确保连接已建立
      await this.ensureConnected()

      let session = null
      try {
        this.loading = true
        // 为每个查询创建新的会话
        session = this.driver.session({ database: 'neo4j' })
        const result = await session.run(query, params)
        return result.records.map(record => {
          const obj = record.toObject()
          // 将 BigInt 值转换为数字
          return this.convertBigIntToNumber(obj)
        })
      } catch (error) {
        this.error = error.message
        console.error('Query execution error:', error)
        console.error('Query:', query)
        console.error('Params:', params)
        throw error
      } finally {
        // 确保会话总是被关闭
        if (session) {
          await session.close()
        }
        this.loading = false
      }
    },

    // 确保数据库连接已建立
    async ensureConnected() {
      if (this.connected) {
        return true
      }

      console.log('数据库未连接，尝试建立连接...')
      const success = await this.connect()
      
      if (!success) {
        throw new Error('Failed to establish database connection')
      }
      
      return true
    },

    // 递归地将对象中的 BigInt 值和 Neo4j Integer 对象转换为数字
    convertBigIntToNumber(obj) {
      if (obj === null || obj === undefined) {
        return obj
      }
      
      // 处理 BigInt
      if (typeof obj === 'bigint') {
        return Number(obj)
      }
      
      // 处理 Neo4j Integer 对象 {low: number, high: number}
      if (obj && typeof obj === 'object' && 'low' in obj && 'high' in obj) {
        // Neo4j Integer 对象转换为普通数字
        return obj.high === 0 ? obj.low : obj.high * Math.pow(2, 32) + obj.low
      }
      
      if (Array.isArray(obj)) {
        return obj.map(item => this.convertBigIntToNumber(item))
      }
      
      if (typeof obj === 'object') {
        const result = {}
        for (const [key, value] of Object.entries(obj)) {
          result[key] = this.convertBigIntToNumber(value)
        }
        return result
      }
        return obj
    },

    // 获取湖泊统计数据
    async getLakeStats() {
      try {
        const query = `
          MATCH (l:Lake)
          OPTIONAL MATCH (l)-[:MENTIONED_IN_GAZETTEER]->(g:Gazetteer)
          OPTIONAL MATCH (l)-[:MENTIONED_IN_POEM]->(p:Poem)
          WITH l, 
               count(DISTINCT g) as gazetteer_count,
               count(DISTINCT p) as poem_count
          RETURN l.name as lake_name,
                 gazetteer_count,
                 poem_count,
                 (gazetteer_count + poem_count) as total_mentions
          ORDER BY total_mentions DESC, gazetteer_count DESC, poem_count DESC
        `
        const result = await this.runQuery(query)
        console.log('湖泊统计数据:', result)
        return result
      } catch (error) {
        console.error('获取湖泊统计失败:', error)
        return []
      }
    },

    // 获取总体统计信息
    async getOverallStats() {
      try {
        // 分别查询每种类型的数量，避免复杂的联接
        const lakeQuery = 'MATCH (l:Lake) RETURN count(l) as count'
        const gazetteerQuery = 'MATCH (g:Gazetteer) RETURN count(g) as count'
        const poemQuery = 'MATCH (p:Poem) RETURN count(p) as count'
        const locationQuery = 'MATCH (l:Lake) WHERE l.location IS NOT NULL RETURN count(DISTINCT l.location) as count'
        
        const [lakeResult, gazetteerResult, poemResult, locationResult] = await Promise.all([
          this.runQuery(lakeQuery),
          this.runQuery(gazetteerQuery),
          this.runQuery(poemQuery),
          this.runQuery(locationQuery)
        ])
        
        return {
          lake_count: lakeResult[0]?.count || 0,
          gazetteer_count: gazetteerResult[0]?.count || 0,
          poem_count: poemResult[0]?.count || 0,
          location_count: locationResult[0]?.count || 0
        }
      } catch (error) {
        console.error('获取统计信息失败:', error)
        return {
          lake_count: 0,
          gazetteer_count: 0,
          poem_count: 0,
          location_count: 0
        }
      }
    },

    // 获取湖泊详细信息
    async getLakeDetails(lakeName) {
      const query = `
        MATCH (l:Lake {name: $lakeName})
        OPTIONAL MATCH (l)-[:MENTIONED_IN_GAZETTEER]->(g:Gazetteer)
        OPTIONAL MATCH (l)-[:MENTIONED_IN_POEM]->(p:Poem)
        RETURN l.name as lake_name,
               l.location as location,
               collect(DISTINCT {source: g.source, content: g.content}) as gazetteers,
               collect(DISTINCT {name: p.name, full_text: p.full_text}) as poems
      `
      const result = await this.runQuery(query, { lakeName })
      return result[0] || null
    },

    // 获取所有湖泊列表
    async getAllLakes() {
      const query = `
        MATCH (l:Lake)
        OPTIONAL MATCH (l)-[:MENTIONED_IN_GAZETTEER]->(g:Gazetteer)
        OPTIONAL MATCH (l)-[:MENTIONED_IN_POEM]->(p:Poem)
        WITH l,
             count(DISTINCT g) as gazetteer_count,
             count(DISTINCT p) as poem_count
        RETURN l.name as name,
               l.location as location,
               gazetteer_count,
               poem_count,
               (gazetteer_count + poem_count) as total_mentions
        ORDER BY total_mentions DESC
      `
      return await this.runQuery(query)
    },

    // 获取所有方志列表
    async getAllGazetteers() {
      const query = `
        MATCH (g:Gazetteer)
        OPTIONAL MATCH (l:Lake)-[:MENTIONED_IN_GAZETTEER]->(g)
        WITH g, collect(DISTINCT l.name) as lakes
        RETURN g.source as source,
               g.content as content,
               lakes,
               size(lakes) as lake_count
        ORDER BY lake_count DESC
      `
      return await this.runQuery(query)
    },

    // 获取所有诗词列表
    async getAllPoems() {
      const query = `
        MATCH (p:Poem)
        OPTIONAL MATCH (l:Lake)-[:MENTIONED_IN_POEM]->(p)
        WITH p, collect(DISTINCT l.name) as lakes
        RETURN p.name as name,
               p.full_text as full_text,
               lakes,
               size(lakes) as lake_count
        ORDER BY lake_count DESC
      `
      return await this.runQuery(query)
    },

    // 获取地理分布数据
    async getLocationDistribution() {
      const query = `
        MATCH (l:Lake)
        WHERE l.location IS NOT NULL
        WITH l.location as location, count(l) as lake_count
        RETURN location,
               lake_count
        ORDER BY lake_count DESC
      `
      return await this.runQuery(query)
    },

    // 调试方法：测试数据库连接和基本查询
    async debugConnection() {
      try {
        console.log('=== Neo4j 调试信息 ===')
        console.log('连接状态:', this.connected)
        console.log('驱动程序:', !!this.driver)
        
        if (!this.connected || !this.driver) {
          console.log('数据库未连接，尝试连接...')
          await this.connect()
        }
        
        // 测试基本查询
        console.log('测试基本查询...')
        const testQuery = 'MATCH (n) RETURN count(n) as total_nodes'
        const result = await this.runQuery(testQuery)
        console.log('节点总数:', result)
        
        // 获取所有节点标签
        const labelsQuery = 'CALL db.labels() YIELD label RETURN label'
        const labels = await this.runQuery(labelsQuery)
        console.log('数据库中的节点标签:', labels)
        
        // 获取所有关系类型
        const relTypesQuery = 'CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType'
        const relationshipTypes = await this.runQuery(relTypesQuery)
        console.log('数据库中的关系类型:', relationshipTypes)
        
        // 测试各个节点类型的数量（基于实际存在的标签）
        if (labels.length > 0) {
          for (const labelObj of labels) {
            const label = labelObj.label
            const query = `MATCH (n:\`${label}\`) RETURN count(n) as count`
            const result = await this.runQuery(query)
            console.log(`${label} 节点数量:`, result)
          }
        }
        
        // 检查一些示例节点的属性
        const sampleQuery = 'MATCH (n) RETURN labels(n) as labels, keys(n) as properties LIMIT 5'
        const samples = await this.runQuery(sampleQuery)
        console.log('示例节点信息:', samples)
        
      } catch (error) {
        console.error('调试查询失败:', error)
      }
    },

    // 初始化连接
    async init() {
      if (!this.connected && !this.connecting) {
        await this.connect()
      }
    },
  }
})
