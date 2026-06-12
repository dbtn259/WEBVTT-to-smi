use tauri::command;

#[command]
async fn fetch_vtt_content(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("요청 실패: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP 오류: {}", response.status()));
    }

    let text = response
        .text()
        .await
        .map_err(|e| format!("응답 읽기 실패: {}", e))?;

    Ok(text)
}

#[command]
async fn save_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content.as_bytes()).map_err(|e| format!("저장 실패: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![fetch_vtt_content, save_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
