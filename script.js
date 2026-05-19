const { createClient } = window.supabase;
const SUPABASE_URL = "https://efddussnhxfdlgpxuzyh.supabase.co";
const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmZGR1c3NuaHhmZGxncHh1enloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxNjYwMjUsImV4cCI6MjA5NDc0MjAyNX0.P0kgqlncsD_O4ETPytiTPCRXraU1cgsX3MWopohYHAM";
const BUCKET_NAME = "Videos";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const uploadStatus = document.getElementById("uploadStatus");
const uploadBtn = document.getElementById("uploadBtn");
const totalCountEl = document.getElementById("totalCount");
const progressText = document.getElementById("progressText");
const progressBar = document.getElementById("progressBar");


// ─────────────────────────────────────────────
//  VIDEO COUNT
// ─────────────────────────────────────────────
const loadStats = async () => {
    try {
        let allFiles = [];
        let page = 1;
        const pageSize = 1000;

        while (true) {
            const { data, error } = await supabase.storage
                .from(BUCKET_NAME)
                .list("uploads/", {
                    limit: pageSize,
                    offset: (page - 1) * pageSize,
                });

            if (error) {
                console.error("Stats error:", error);
                totalCountEl.textContent = "Error";
                return;
            }

            if (!data || data.length === 0) break;

            allFiles = allFiles.concat(data);
            page++;
        }

        totalCountEl.textContent = allFiles.length;
    } catch (err) {
        console.error("Load stats failed:", err);
        totalCountEl.textContent = "Error";
    }
};


// ─────────────────────────────────────────────
//  UPLOAD
// ─────────────────────────────────────────────
uploadBtn.addEventListener("click", async () => {
    const fileInput = document.getElementById("videoInput");
    const files = fileInput.files;

    if (!files || files.length === 0) {
        uploadStatus.textContent = "Please select at least one video file.";
        uploadStatus.className = "status error";
        return;
    }

    uploadBtn.disabled = true;
    progressBar.style.width = "0%";
    progressText.textContent = `0 / ${files.length} files`;
    uploadStatus.textContent = "";
    uploadStatus.className = "status";

    let successCount = 0;
    let errorCount = 0;
    const failedFiles = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = `uploads/${file.name}`;

        const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(fileName, file, { upsert: false });

        if (error) {
            errorCount++;
            failedFiles.push({ name: file.name, message: error.message || "Unknown error" });
            console.error("Upload failed:", fileName, error);
        } else {
            successCount++;
            console.log("Uploaded:", fileName);
        }

        const current = i + 1;
        const percent = Math.floor((current * 100) / files.length);
        progressBar.style.width = `${percent}%`;
        progressText.textContent = `${current} / ${files.length} files`;
    }

    if (errorCount > 0) {
        const preview = failedFiles
            .slice(0, 10)
            .map((item) => `${item.name}: ${item.message}`)
            .join(" | ");

        uploadStatus.textContent = `Upload complete: ${successCount} succeeded, ${errorCount} failed. ${failedFiles.length > 10 ? "First 10 failures: " : ""}${preview}`;
        uploadStatus.className = "status error";
    } else {
        uploadStatus.textContent = `Upload OK! ${successCount} file(s) uploaded.`;
        uploadStatus.className = "status success";
    }

    uploadBtn.disabled = false;
    loadStats();
});


// ─────────────────────────────────────────────
//  FILE RENAME (LEFT BOX)
// ─────────────────────────────────────────────
document.getElementById("renameSearchBtn").addEventListener("click", async () => {
    const resultEl = document.getElementById("renameSearchResult");
    const query = document.getElementById("renameSearchInput").value.trim().toLowerCase();

    if (!query) {
        resultEl.innerHTML = "Please enter a filename to search.";
        resultEl.style.display = "block";
        return;
    }

    resultEl.innerHTML = "Searching...";
    resultEl.style.display = "block";

    try {
        const { data: allFiles, error } = await supabase.storage
            .from(BUCKET_NAME)
            .list("uploads/", { limit: 10000 });

        if (error) {
            resultEl.innerHTML = "Search failed: " + error.message;
            return;
        }

        const matched = allFiles.filter((f) =>
            f.name.toLowerCase().includes(query)
        );

        if (matched.length === 0) {
            resultEl.innerHTML = `No files found matching <strong>${query}</strong>.`;
            return;
        }

        let html = `<strong>${matched.length} file(s) found:</strong>`;

        matched.forEach((file, index) => {
            const nameWithoutExt = file.name.replace(/\.mp4$/i, "");
            html += `
                <div id="renameRow_${index}" style="
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 10px;
                    flex-wrap: wrap;
                ">
                    <span style="
                        flex: 1;
                        min-width: 180px;
                        font-size: 0.9rem;
                        color: #333;
                        word-break: break-all;
                    ">${file.name}</span>

                    <input
                        type="text"
                        id="newName_${index}"
                        value="${nameWithoutExt}"
                        style="
                            flex: 1;
                            min-width: 180px;
                            padding: 6px 10px;
                            border: 1px solid #dee2e6;
                            border-radius: 6px;
                            font-size: 0.9rem;
                        "
                    />

                    <button
                        onclick="renameFile('${file.name}', ${index})"
                        style="
                            padding: 6px 14px;
                            background: #0d6efd;
                            color: #fff;
                            border: none;
                            border-radius: 6px;
                            font-size: 0.9rem;
                            cursor: pointer;
                            white-space: nowrap;
                        "
                    >Rename</button>

                    <span id="renameStatus_${index}" style="font-size:0.85rem;"></span>
                </div>
            `;
        });

        resultEl.innerHTML = html;
        resultEl.style.cssText = `
            display: block;
            max-height: 350px;
            overflow-y: auto;
            padding: 12px 16px;
            background: #f8f9fa;
            border-radius: 6px;
        `;

    } catch (err) {
        resultEl.innerHTML = "Search error: " + err.message;
        resultEl.style.display = "block";
    }
});

window.renameFile = async function (oldFileName, index) {
    const newNameInput = document.getElementById(`newName_${index}`);
    const statusEl = document.getElementById(`renameStatus_${index}`);
    const newName = newNameInput.value.trim();

    if (!newName) {
        statusEl.style.color = "red";
        statusEl.textContent = "⚠ Name cannot be empty.";
        return;
    }

    const newFileName = newName.endsWith(".mp4") ? newName : newName + ".mp4";

    if (newFileName === oldFileName) {
        statusEl.style.color = "orange";
        statusEl.textContent = "⚠ Name is the same.";
        return;
    }

    statusEl.style.color = "#555";
    statusEl.textContent = "Renaming...";

    try {
        const { error: copyError } = await supabase.storage
            .from(BUCKET_NAME)
            .copy(`uploads/${oldFileName}`, `uploads/${newFileName}`);

        if (copyError) {
            statusEl.style.color = "red";
            statusEl.textContent = "✗ Copy failed: " + copyError.message;
            return;
        }

        const { error: deleteError } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([`uploads/${oldFileName}`]);

        if (deleteError) {
            statusEl.style.color = "orange";
            statusEl.textContent = "✗ Copied but delete failed: " + deleteError.message;
            return;
        }

        statusEl.style.color = "green";
        statusEl.textContent = "✓ Renamed successfully!";

        const row = document.getElementById(`renameRow_${index}`);
        row.querySelector("span").textContent = newFileName;
        row.querySelector("button").setAttribute("onclick", `renameFile('${newFileName}', ${index})`);

    } catch (err) {
        statusEl.style.color = "red";
        statusEl.textContent = "✗ Error: " + err.message;
    }
};


// ─────────────────────────────────────────────
//  SEARCH & DOWNLOAD MERGED (RIGHT BOX)
// ─────────────────────────────────────────────
let searchFoundUrls = [];
let searchNotFoundUrls = [];

document.getElementById("searchBtn").addEventListener("click", async () => {
    const searchResultEl = document.getElementById("searchResult");
    const searchActions = document.getElementById("searchActions");
    const downloadFoundBtn = document.getElementById("downloadFoundBtn");
    const exportExcelBtn = document.getElementById("exportExcelBtn");
    const statusEl = document.getElementById("mergedDownloadStatus");

    // Reset
    searchFoundUrls = [];
    searchNotFoundUrls = [];
    statusEl.textContent = "";
    downloadFoundBtn.style.display = "none";
    exportExcelBtn.style.display = "none";
    searchActions.style.display = "none";

    const raw = document.getElementById("searchInput").value;
    const lines = raw.split("\n").map((s) => s.trim()).filter((s) => s.length > 0);

    if (lines.length === 0) {
        searchResultEl.textContent = "Please enter at least one URL.";
        searchResultEl.style.display = "block";
        return;
    }

    searchResultEl.textContent = "Searching...";
    searchResultEl.style.display = "block";

    try {
        const { data: allFiles, error } = await supabase.storage
            .from(BUCKET_NAME)
            .list("uploads/", { limit: 10000 });

        if (error) {
            searchResultEl.textContent = "Search failed: " + error.message;
            return;
        }

        const fileNamesInBucket = allFiles.map((f) => f.name.toLowerCase());
        const results = [];

        for (const url of lines) {
            let cleaned = url
                .replace(/^https?:\/\//i, "")
                .replace(/\/+$/i, "");

            if (!cleaned) {
                results.push({ input: url, status: "invalid", fileName: null, alternative: null });
                continue;
            }

            const expectedFile = `${cleaned}.mp4`;
            const exists = fileNamesInBucket.includes(expectedFile.toLowerCase());

            if (exists) {
                results.push({ input: url, status: "found", fileName: expectedFile, alternative: null });
                continue;
            }

            // ── Not found — try www toggle ──────────────────
            let altCleaned = null;

            if (cleaned.startsWith("www.")) {
                // Has www → try without www
                altCleaned = cleaned.slice(4);
            } else {
                // No www → try with www
                altCleaned = `www.${cleaned}`;
            }

            const altFile = `${altCleaned}.mp4`;
            const altExists = fileNamesInBucket.includes(altFile.toLowerCase());

            results.push({
                input: url,
                status: "not-found",
                fileName: expectedFile,
                alternative: altExists ? altFile : null,  // null if alt also not found
            });
        }

        const found = results.filter((r) => r.status === "found");
        const notFound = results.filter((r) => r.status === "not-found");
        const invalid = results.filter((r) => r.status === "invalid");

        searchFoundUrls = found;
        searchNotFoundUrls = notFound;

        let html = "";

        // ── Found ────────────────────────────────────────────
        if (found.length) {
            html += `<strong style="color:#0d6efd;">✓ ${found.length} found:</strong><br>`;
            html += found.map((r) => r.input).join("<br>");
            html += "<br><br>";
        }

        // ── Not Found ────────────────────────────────────────
        if (notFound.length) {
            html += `<strong style="color:#dc3545;">✗ ${notFound.length} not found:</strong><br>`;
            notFound.forEach((r) => {
                if (r.alternative) {
                    // File exists with www toggled — show suggestion
                    const nameWithoutMp4 = r.alternative.replace(/\.mp4$/i, "");
                    html += `${r.input}
                        <span style="
                            font-size:0.8rem;
                            color:#856404;
                            background:#fff3cd;
                            padding:1px 6px;
                            border-radius:4px;
                            margin-left:4px;
                        ">⚠ exists as: ${r.alternative}</span>
                        <span
                            title="Copy filename"
                            onclick="navigator.clipboard.writeText('${nameWithoutMp4}').then(() => { this.innerHTML='✓'; setTimeout(() => this.innerHTML='<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'13\\' height=\\'13\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'2\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'><rect x=\\'9\\' y=\\'9\\' width=\\'13\\' height=\\'13\\' rx=\\'2\\' ry=\\'2\\'></rect><path d=\\'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1\\'></path></svg>', 1500); })"
                            style="
                                display:inline-flex;
                                align-items:center;
                                margin-left:5px;
                                cursor:pointer;
                                color:#555;
                                vertical-align:middle;
                                opacity:0.7;
                            "
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </span><br>`;
                } else {
                    // Truly not found
                    html += `${r.input}<br>`;
                }
            });
            html += "<br>";
        }

        // ── Invalid ──────────────────────────────────────────
        if (invalid.length) {
            html += `<strong style="color:#888;">⚠ ${invalid.length} invalid:</strong><br>`;
            html += invalid.map((r) => r.input).join("<br>");
        }

        if (!html) html = "No valid input lines.";

        searchResultEl.innerHTML = html;
        searchResultEl.style.cssText = `
            display: block;
            max-height: 250px;
            overflow-y: auto;
            padding: 12px 16px;
            background: #f8f9fa;
            border-radius: 6px;
            font-size: 0.9rem;
            line-height: 1.7;
        `;

        // Show action buttons
        searchActions.style.display = "flex";
        if (found.length) downloadFoundBtn.style.display = "inline-block";
        if (notFound.length) exportExcelBtn.style.display = "inline-block";

    } catch (err) {
        searchResultEl.textContent = "Search error: " + err.message;
        searchResultEl.style.display = "block";
    }
});


document.getElementById("downloadFoundBtn").addEventListener("click", async () => {
    await downloadFiles(searchFoundUrls, "Found");
});

document.getElementById("downloadAllBtn").addEventListener("click", async () => {
    const statusEl = document.getElementById("downloadAllStatus");
    statusEl.style.display = "block";
    statusEl.className = "status";
    statusEl.textContent = "Loading video list...";

    try {
        let allFiles = [];
        let page = 1;
        const pageSize = 1000;

        while (true) {
            const { data, error } = await supabase.storage
                .from(BUCKET_NAME)
                .list("uploads/", {
                    limit: pageSize,
                    offset: (page - 1) * pageSize,
                });

            if (error) {
                throw error;
            }

            if (!data || data.length === 0) break;
            allFiles = allFiles.concat(data);
            if (data.length < pageSize) break;
            page++;
        }

        if (allFiles.length === 0) {
            statusEl.textContent = "No videos found to download.";
            statusEl.className = "status error";
            return;
        }

        const items = allFiles.map((file) => ({ fileName: file.name }));
        await downloadFiles(items, "All", statusEl);
    } catch (err) {
        statusEl.textContent = "Download all error: " + err.message;
        statusEl.className = "status error";
    }
});

// document.getElementById("downloadNotFoundBtn").addEventListener("click", async () => {
//     await downloadFiles(searchNotFoundUrls, "NotFound");
// });

async function downloadFiles(urlList, label, statusEl = null) {
    if (!statusEl) {
        statusEl = document.getElementById("mergedDownloadStatus");
    }

    if (!urlList || urlList.length === 0) {
        statusEl.textContent = "No files to download.";
        statusEl.className = "status error";
        return;
    }

    statusEl.textContent = "Preparing ZIP, please wait...";
    statusEl.className = "status";

    try {
        const zip = new JSZip();
        let successCount = 0;
        let failCount = 0;

        for (const item of urlList) {
            const filePath = `uploads/${item.fileName}`;
            const { data, error } = supabase.storage
                .from(BUCKET_NAME)
                .getPublicUrl(filePath);

            if (error) { failCount++; continue; }

            const res = await fetch(data.publicUrl);
            if (!res.ok) { failCount++; continue; }

            const blob = await res.blob();
            zip.file(item.fileName, blob);
            successCount++;
        }

        if (successCount === 0) {
            statusEl.textContent = "No files could be added to ZIP.";
            statusEl.className = "status error";
            return;
        }

        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const dd = String(today.getDate()).padStart(2, "0");
        const zipName = `Video_${yyyy}-${mm}-${dd}.zip`;

        const zipBlob = await zip.generateAsync({ type: "blob" });
        saveAs(zipBlob, zipName);

        statusEl.textContent = `✓ ZIP ready — ${successCount} file(s), ${failCount} failed.`;
        statusEl.className = "status success";

        setTimeout(() => window.location.reload(), 800);

    } catch (err) {
        statusEl.textContent = "Download error: " + err.message;
        statusEl.className = "status error";
    }
}

document.getElementById("exportExcelBtn").addEventListener("click", () => {
    if (searchNotFoundUrls.length === 0) return;

    const rows = [["URL", "Status"]];
    for (const r of searchNotFoundUrls) rows.push([r.input, "Not Found"]);

    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "not_found_urls.csv";
    a.click();
    URL.revokeObjectURL(url);
});


// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────
loadStats();