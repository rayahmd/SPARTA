// Saklar fitur UI. Ubah nilainya di sini; tidak ada kode yang dihapus saat
// sebuah fitur disembunyikan.

/**
 * Tampilkan UI mode Prediction: toggle Live/Prediction dan badge "PREDIKSI +30M"
 * di header peta, Forecast Timeline, menu "Prediction" di sidebar, dan halaman
 * /ephor/prediction (saat false halaman itu redirect ke /ephor).
 * Data prediksi di kartu AI Recommendation tidak terpengaruh.
 */
export const SHOW_PREDICTION_UI: boolean = false;

/**
 * Tampilkan menu "Traffic Light" di sidebar. Halaman /ephor/traffic-light
 * sendiri tetap ada dan masih bisa dibuka lewat URL-nya.
 */
export const SHOW_TRAFFIC_LIGHT_MENU: boolean = false;
