const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://varadouro:varadouro_dev@localhost:5432/varadouro_digital' });

pool.query(`
  SELECT nome_municipio, sisagua_total_amostras, sisagua_total_ecoli,
         sisagua_total_fora_padrao, sisagua_percentual_fora_padrao
  FROM mart.saude_resumo_municipio
  WHERE sisagua_total_amostras IS NOT NULL AND sisagua_total_amostras > 0
  ORDER BY sisagua_total_amostras DESC
  LIMIT 5
`).then(r => {
  console.log('Municípios com dados SISAGUA:');
  r.rows.forEach(row => console.log(JSON.stringify(row)));
  return pool.query('SELECT COUNT(*) as total, COUNT(sisagua_total_amostras) as com_sisagua FROM mart.saude_resumo_municipio');
}).then(r => {
  console.log('Total municípios:', r.rows[0].total, '| Com SISAGUA:', r.rows[0].com_sisagua);
  pool.end();
}).catch(e => { console.error(e.message); pool.end(); });
