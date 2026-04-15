/**
 * Agendador de jobs ETL — Varadouro Digital
 * Executa: ts-node schedule.ts
 */

import cron from 'node-cron'
import { executarETLCombustivel } from './jobs/combustivel'

console.log('Agendador ETL iniciado — Varadouro Digital')
console.log('Combustível: todo dia às 06:00 e 18:00\n')

// Combustível: duas vezes por dia (06:00 e 18:00)
cron.schedule('0 6,18 * * *', async () => {
  console.log('\n[CRON] Disparando job: combustivel')
  await executarETLCombustivel().catch(console.error)
}, { timezone: 'America/Rio_Branco' })

// Manter processo vivo
process.on('SIGINT', () => {
  console.log('\nAgendador encerrado.')
  process.exit(0)
})
