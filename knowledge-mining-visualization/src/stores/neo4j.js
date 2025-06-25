import { defineStore } from 'pinia'
import neo4j from 'neo4j-driver'

export const useNeo4jStore = defineStore('neo4j', {
  state: () => ({
    driver: null,
    connected: false,
    connecting: false,
    loading: false,
    error: null,
    initializing: false,
    fullyInitialized: false,
    initPromise: null, // 用于跟踪初始化Promise
    config: {
      uri: 'neo4j+s://ebe0de13.databases.neo4j.io',
      username: 'neo4j',
      password: 'da64KewjnSxC8GJV__j8jH3XBGsvuugZrzGEj36CnsQ'
    },
    // 数据缓存
    cache: {
      initialized: false,
      lastUpdated: null,
      overallStats: null,
      lakeStats: null,
      lakeDetails: new Map(),
      allLakes: null,
      allGazetteers: null,
      allPoems: null,
      locationDistribution: null
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
    async getLakeStats(useCache = true) {
      // 确保初始化完成
      await this.waitForInitialization()
      
      if (useCache && this.cache.lakeStats) {
        return this.cache.lakeStats
      }

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
        
        // 缓存结果
        this.cache.lakeStats = result
        this.cache.lastUpdated = new Date()
        
        return result
      } catch (error) {
        console.error('获取湖泊统计失败:', error)
        return []
      }
    },

    // 获取总体统计信息
    async getOverallStats(useCache = true) {
      // 确保初始化完成
      await this.waitForInitialization()
      
      if (useCache && this.cache.overallStats) {
        return this.cache.overallStats
      }

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
        
        const result = {
          lake_count: lakeResult[0]?.count || 0,
          gazetteer_count: gazetteerResult[0]?.count || 0,
          poem_count: poemResult[0]?.count || 0,
          location_count: locationResult[0]?.count || 0
        }
        
        // 缓存结果
        this.cache.overallStats = result
        this.cache.lastUpdated = new Date()
        
        return result
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
    async getLakeDetails(lakeName, useCache = true) {
      // 确保初始化完成
      await this.waitForInitialization()
      
      if (useCache && this.cache.lakeDetails.has(lakeName)) {
        return this.cache.lakeDetails.get(lakeName)
      }

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
      const lakeDetail = result[0] || null
      
      // 缓存结果
      this.cache.lakeDetails.set(lakeName, lakeDetail)
      
      return lakeDetail
    },

    // 获取所有湖泊列表
    async getAllLakes(useCache = true) {
      // 确保初始化完成
      await this.waitForInitialization()
      
      if (useCache && this.cache.allLakes) {
        return this.cache.allLakes
      }

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
      const result = await this.runQuery(query)
      
      // 缓存结果
      this.cache.allLakes = result
      this.cache.lastUpdated = new Date()
      
      return result
    },

    // 获取所有方志列表
    async getAllGazetteers(useCache = true) {
      // 确保初始化完成
      await this.waitForInitialization()
      
      if (useCache && this.cache.allGazetteers) {
        return this.cache.allGazetteers
      }

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
      const result = await this.runQuery(query)
      
      // 缓存结果
      this.cache.allGazetteers = result
      this.cache.lastUpdated = new Date()
      
      return result
    },

    // 获取所有诗词列表
    async getAllPoems(useCache = true) {
      // 确保初始化完成
      await this.waitForInitialization()
      
      if (useCache && this.cache.allPoems) {
        return this.cache.allPoems
      }

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
      const result = await this.runQuery(query)
      
      // 缓存结果
      this.cache.allPoems = result
      this.cache.lastUpdated = new Date()
      
      return result
    },

    // 获取地理分布数据
    async getLocationDistribution(useCache = true) {
      // 确保初始化完成
      await this.waitForInitialization()
      
      if (useCache && this.cache.locationDistribution) {
        return this.cache.locationDistribution
      }

      const query = `
        MATCH (l:Lake)
        WHERE l.location IS NOT NULL
        WITH l.location as location, count(l) as lake_count
        RETURN location,
               lake_count
        ORDER BY lake_count DESC
      `
      const result = await this.runQuery(query)
      
      // 缓存结果
      this.cache.locationDistribution = result
      this.cache.lastUpdated = new Date()
      
      return result
    },

    // 预加载所有数据到缓存
    async preloadAllData() {
      if (this.cache.initialized) {
        console.log('数据已预加载，跳过')
        return true
      }

      try {
        console.log('开始预加载所有数据...')
        this.loading = true

        // 直接调用runQuery，避免循环调用waitForInitialization
        const lakeQuery = `
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

        const overallQueries = [
          'MATCH (l:Lake) RETURN count(l) as count',
          'MATCH (g:Gazetteer) RETURN count(g) as count', 
          'MATCH (p:Poem) RETURN count(p) as count',
          'MATCH (l:Lake) WHERE l.location IS NOT NULL RETURN count(DISTINCT l.location) as count'
        ]

        const allLakesQuery = `
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

        const allGazetteersQuery = `
          MATCH (g:Gazetteer)
          OPTIONAL MATCH (l:Lake)-[:MENTIONED_IN_GAZETTEER]->(g)
          WITH g, collect(DISTINCT l.name) as lakes
          RETURN g.source as source,
                 g.content as content,
                 lakes,
                 size(lakes) as lake_count
          ORDER BY lake_count DESC
        `

        const allPoemsQuery = `
          MATCH (p:Poem)
          OPTIONAL MATCH (l:Lake)-[:MENTIONED_IN_POEM]->(p)
          WITH p, collect(DISTINCT l.name) as lakes
          RETURN p.name as name,
                 p.full_text as full_text,
                 lakes,
                 size(lakes) as lake_count
          ORDER BY lake_count DESC
        `

        const locationDistributionQuery = `
          MATCH (l:Lake)
          WHERE l.location IS NOT NULL
          WITH l.location as location, count(l) as lake_count
          RETURN location,
                 lake_count
          ORDER BY lake_count DESC
        `

        // 并行执行所有查询
        const [
          lakeStatsResult,
          [lakeCountResult, gazetteerCountResult, poemCountResult, locationCountResult],
          allLakesResult,
          allGazetteersResult,
          allPoemsResult,
          locationDistributionResult
        ] = await Promise.all([
          this.runQuery(lakeQuery),
          Promise.all(overallQueries.map(query => this.runQuery(query))),
          this.runQuery(allLakesQuery),
          this.runQuery(allGazetteersQuery),
          this.runQuery(allPoemsQuery),
          this.runQuery(locationDistributionQuery)
        ])

        // 缓存所有结果
        this.cache.lakeStats = lakeStatsResult
        this.cache.overallStats = {
          lake_count: lakeCountResult[0]?.count || 0,
          gazetteer_count: gazetteerCountResult[0]?.count || 0,
          poem_count: poemCountResult[0]?.count || 0,
          location_count: locationCountResult[0]?.count || 0
        }
        this.cache.allLakes = allLakesResult
        this.cache.allGazetteers = allGazetteersResult
        this.cache.allPoems = allPoemsResult
        this.cache.locationDistribution = locationDistributionResult
        
        this.cache.initialized = true
        this.cache.lastUpdated = new Date()
        
        console.log('数据预加载完成:', {
          lakeStats: lakeStatsResult.length,
          allLakes: allLakesResult.length,
          allGazetteers: allGazetteersResult.length,
          allPoems: allPoemsResult.length,
          locationDistribution: locationDistributionResult.length,
          overallStats: this.cache.overallStats
        })

        return true
      } catch (error) {
        console.error('预加载数据失败:', error)
        this.error = error.message
        return false
      } finally {
        this.loading = false
      }
    },

    // 清除缓存
    clearCache() {
      this.cache.initialized = false
      this.cache.lastUpdated = null
      this.cache.overallStats = null
      this.cache.lakeStats = null
      this.cache.lakeDetails.clear()
      this.cache.allLakes = null
      this.cache.allGazetteers = null
      this.cache.allPoems = null
      this.cache.locationDistribution = null
      console.log('缓存已清除')
    },

    // 检查缓存是否过期（可选功能，用于长时间运行的应用）
    isCacheExpired(maxAgeMinutes = 60) {
      if (!this.cache.lastUpdated) return true
      const now = new Date()
      const cacheAge = (now - this.cache.lastUpdated) / (1000 * 60) // 分钟
      return cacheAge > maxAgeMinutes
    },

    // 刷新数据（清除缓存并重新加载）
    async refreshData() {
      console.log('刷新数据...')
      this.clearCache()
      return await this.preloadAllData()
    },
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

    // 初始化连接并预加载数据
    async init() {
      // 如果已经完全初始化，直接返回
      if (this.fullyInitialized) {
        return true
      }

      // 如果正在初始化，等待完成
      if (this.initializing) {
        return new Promise((resolve) => {
          const checkInterval = setInterval(() => {
            if (this.fullyInitialized || !this.initializing) {
              clearInterval(checkInterval)
              resolve(this.fullyInitialized)
            }
          }, 100)
        })
      }

      try {
        this.initializing = true
        console.log('开始初始化数据库连接和数据...')

        // 建立连接
        if (!this.connected && !this.connecting) {
          console.log('建立数据库连接...')
          const connected = await this.connect()
          if (!connected) {
            throw new Error('数据库连接失败')
          }
        }

        // 预加载数据
        if (this.connected && !this.cache.initialized) {
          console.log('预加载数据...')
          await this.preloadAllData()
        }

        this.fullyInitialized = true
        console.log('初始化完成')
        return true

      } catch (error) {
        console.error('初始化失败:', error)
        this.error = error.message
        this.fullyInitialized = false
        return false
      } finally {
        this.initializing = false
      }
    },

    // 等待初始化完成
    async waitForInitialization() {
      if (this.fullyInitialized) {
        return true
      }

      if (!this.initializing) {
        return await this.init()
      }

      // 等待初始化完成
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (this.fullyInitialized || !this.initializing) {
            clearInterval(checkInterval)
            resolve(this.fullyInitialized)
          }
        }, 100)
      })
    },

    // 获取缓存状态信息
    getCacheInfo() {
      return {
        initialized: this.cache.initialized,
        lastUpdated: this.cache.lastUpdated,
        dataTypes: {
          overallStats: !!this.cache.overallStats,
          lakeStats: !!this.cache.lakeStats,
          allLakes: !!this.cache.allLakes,
          allGazetteers: !!this.cache.allGazetteers,
          allPoems: !!this.cache.allPoems,
          locationDistribution: !!this.cache.locationDistribution,
          lakeDetailsCount: this.cache.lakeDetails.size
        }
      }
    },
  }
})
