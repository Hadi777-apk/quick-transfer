// === 状态管理 ===
let currentMode = 'text'; // 可选值: text | file | image | receive

// === 1. 初始化逻辑 (页面加载时执行) ===
window.addEventListener('DOMContentLoaded', () => {
    // A. 法律弹窗检查
    if (!localStorage.getItem('legalAgreed')) {
        document.getElementById('legal-modal').style.display = 'flex';
    }

    // B. [传播优化] 检查 URL 是否带接收码 (例如: site.com/?code=1234)
    const urlParams = new URLSearchParams(window.location.search);
    const codeFromUrl = urlParams.get('code');
    
    if (codeFromUrl && codeFromUrl.length === 4) {
        setMode('receive');
        document.getElementById('input-code-val').value = codeFromUrl;
    }
    
    // 初始化底部切换按钮
    updateSwitchLinks(currentMode);

    const imageDropzone = document.getElementById('image-dropzone');
    const imageInput = document.getElementById('input-image-val');
    const codeInput = document.getElementById('input-code-val');
    const textInput = document.getElementById('input-text-val');

    codeInput.addEventListener('input', () => {
        codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 4);
    });
    codeInput.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.isComposing) {
            event.preventDefault();
            handleSubmit();
        }
    });
    textInput.addEventListener('keydown', event => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            handleSubmit();
        }
    });
    document.querySelectorAll('.file-dropzone').forEach(dropzone => {
        dropzone.tabIndex = 0;
        dropzone.setAttribute('role', 'button');
        dropzone.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                dropzone.click();
            }
        });
    });

    imageDropzone.addEventListener('dragover', event => {
        event.preventDefault();
        imageDropzone.classList.add('dragging');
    });
    imageDropzone.addEventListener('dragleave', () => imageDropzone.classList.remove('dragging'));
    imageDropzone.addEventListener('drop', event => {
        event.preventDefault();
        event.stopPropagation();
        imageDropzone.classList.remove('dragging');
        const transfer = new DataTransfer();
        Array.from(event.dataTransfer.files)
            .filter(file => file.type.startsWith('image/'))
            .slice(0, 20)
            .forEach(file => transfer.items.add(file));
        imageInput.files = transfer.files;
        updateImageSelection(imageInput);
    });
});

function closeLegalModal() {
    localStorage.setItem('legalAgreed', 'true');
    document.getElementById('legal-modal').style.display = 'none';
}

// === 2. 模式切换逻辑 (核心交互) ===
function setMode(mode) {
    currentMode = mode;

    // A. 更新中间输入区域的显示/隐藏
    document.getElementById('area-text').style.display = mode === 'text' ? 'block' : 'none';
    document.getElementById('area-file').style.display = mode === 'file' ? 'block' : 'none';
    document.getElementById('area-image').style.display = mode === 'image' ? 'block' : 'none';
    document.getElementById('area-receive').style.display = mode === 'receive' ? 'block' : 'none';

    // B. 控制“阅后即焚”选项的显示/隐藏
    const optionsPanel = document.getElementById('options-panel');
    if (optionsPanel) {
        if (mode === 'receive') {
            optionsPanel.style.display = 'none';
        } else {
            optionsPanel.style.display = 'flex';
            // 切换回发送模式时，默认重置为不勾选
            const burnCheck = document.getElementById('burn-mode');
            if(burnCheck) burnCheck.checked = false;
        }
    }

    // C. 重置标题和按钮状态
    const titleEl = document.getElementById('action-title');
    const btnEl = document.getElementById('main-btn');
    const resultEl = document.getElementById('result-panel');

    resultEl.style.display = 'none'; 
    resultEl.innerHTML = ''; 

    if (mode === 'text') {
        titleEl.textContent = '粘贴文本生成取件码';
        btnEl.textContent = '生成接收码';
    } else if (mode === 'file') {
        titleEl.textContent = '上传文件生成取件码';
        btnEl.textContent = '生成接收码';
    } else if (mode === 'image') {
        titleEl.textContent = '上传图片生成取件码';
        btnEl.textContent = '生成接收码';
    } else {
        titleEl.textContent = '输入取件码提取内容';
        btnEl.textContent = '立即提取';
    }

    // D. 更新底部快捷按钮
    updateSwitchLinks(mode);

    if (mode === 'text') {
        document.getElementById('input-text-val').focus();
    } else if (mode === 'file') {
        document.getElementById('input-file-val').click();
    } else if (mode === 'image') {
        document.getElementById('input-image-val').click();
    } else {
        const codeInput = document.getElementById('input-code-val');
        codeInput.focus();
        codeInput.select();
    }
}

// 动态渲染快捷切换按钮
function updateSwitchLinks(mode) {
    const area = document.getElementById('switch-area');
    if (!area) return;
    
    let html = '';
    if (mode === 'text') {
        html = `<button class="btn-submit mode-switch-btn" onclick="setMode('receive')">我要接收</button>
                <button class="btn-submit mode-switch-btn" onclick="setMode('file')">分享文件</button>
                <button class="btn-submit mode-switch-btn" onclick="setMode('image')">分享图片</button>`;
    } else if (mode === 'file') {
        html = `<button class="btn-submit mode-switch-btn" onclick="setMode('receive')">我要接收</button>
                <button class="btn-submit mode-switch-btn" onclick="setMode('text')">分享文本</button>
                <button class="btn-submit mode-switch-btn" onclick="setMode('image')">分享图片</button>`;
    } else if (mode === 'image') {
        html = `<button class="btn-submit mode-switch-btn" onclick="setMode('receive')">我要接收</button>
                <button class="btn-submit mode-switch-btn" onclick="setMode('text')">分享文本</button>
                <button class="btn-submit mode-switch-btn" onclick="setMode('file')">分享文件</button>`;
    } else {
        html = `<button class="btn-submit mode-switch-btn" onclick="setMode('text')">分享文本</button>
                <button class="btn-submit mode-switch-btn" onclick="setMode('file')">分享文件</button>
                <button class="btn-submit mode-switch-btn" onclick="setMode('image')">分享图片</button>`;
    }
    area.innerHTML = html;
}

// === 3. 文件名显示优化 ===
function updateFileName(input) {
    if (input.files && input.files[0]) {
        document.getElementById('file-name-display').innerHTML = 
            `<span style="color:var(--primary); font-weight:bold;">${input.files[0].name}</span>`;
    }
}
// === [新增] 生成时间戳文件名 ===
// 格式: 原文件名_YYYYMMDDHHmmss.后缀
function getTimestampedFileName(originalName) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    
    // 生成时间戳字符串: 20260116103055
    const timestamp = now.getFullYear() +
                      pad(now.getMonth() + 1) +
                      pad(now.getDate()) +
                      pad(now.getHours()) +
                      pad(now.getMinutes()) +
                      pad(now.getSeconds());

    // 分离文件名和后缀
    const lastDotIndex = originalName.lastIndexOf('.');
    let baseName = originalName;
    let ext = '';
    
    if (lastDotIndex !== -1) {
        baseName = originalName.substring(0, lastDotIndex);
        ext = originalName.substring(lastDotIndex);
    }

    // 组合新名字
    return `${baseName}_${timestamp}${ext}`;
}
// === 4. 核心提交逻辑 (已更新) ===
async function handleSubmit() {
    const btn = document.getElementById('main-btn');
    const resultPanel = document.getElementById('result-panel');
    const burnModeEl = document.getElementById('burn-mode');
    
    // 锁定按钮
    btn.disabled = true;
    btn.textContent = '处理中...';
    resultPanel.style.display = 'none';
    resultPanel.innerHTML = ''; 

    try {
        let res, data;
        const isBurn = burnModeEl ? burnModeEl.checked : false;

        // --- A. 发送文本 ---
        if (currentMode === 'text') {
            const text = document.getElementById('input-text-val').value;
            if (!text) throw new Error("请输入文本内容");
            if (text.length > 20000) throw new Error(`文本超长 (${text.length}/20000)`);

            res = await fetch('/api/share/text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, burn: isBurn })
            });
        } 
        // --- B. 发送文件 ---
        else if (currentMode === 'file') {
            const fileInput = document.getElementById('input-file-val');
            if (!fileInput.files.length) throw new Error("请选择文件");
            const file = fileInput.files[0];
            
            // 确认文件大小限制为 100MB
            if (file.size > 100 * 1024 * 1024) throw new Error("文件超过 100MB 限制");

            const formData = new FormData();
            
            // [核心修改] 生成带时间戳的新文件名
            const newFileName = getTimestampedFileName(file.name);
            
            // append 的第三个参数可以指定文件名
            // formData.append(name, blob, filename)
            formData.append('file', file, newFileName); 
            
            formData.append('burn', isBurn.toString()); 

            res = await fetch('/api/share/file', { method: 'POST', body: formData });
        }
        // --- C. 发送多张图片 ---
        else if (currentMode === 'image') {
            const imageInput = document.getElementById('input-image-val');
            const images = Array.from(imageInput.files || []);
            if (!images.length) throw new Error("请选择图片");
            if (images.length > 20) throw new Error("一次最多选择 20 张图片");
            if (images.some(file => !file.type.startsWith('image/'))) throw new Error("只能选择图片文件");
            const totalSize = images.reduce((sum, file) => sum + file.size, 0);
            if (totalSize > 100 * 1024 * 1024) throw new Error("图片总大小超过 100MB 限制");

            const formData = new FormData();
            images.forEach(file => formData.append('images', file, getTimestampedFileName(file.name)));
            formData.append('burn', isBurn.toString());
            res = await fetch('/api/share/images', { method: 'POST', body: formData });
        }
        // --- D. 接收内容 ---
        else {
            const code = document.getElementById('input-code-val').value;
            if (!/^\d{4}$/.test(code)) throw new Error("请输入 4 位数字接收码");
            res = await fetch(`/api/get/${code}`);
        }

        const rawText = await res.text();
        try { data = JSON.parse(rawText); } catch(e) { throw new Error("服务器响应异常"); }

        if (!res.ok) throw new Error(data.error || "操作失败");
        resultPanel.style.display = 'block';        
        if (currentMode === 'receive') {
            if (data.type === 'text') {

        copyToClipboard(data.content);
        
        const burnHint = data.burn ? '<div style="color:#ef4444; font-size:0.8rem; margin-bottom:5px;">🔥 此消息已销毁，无法再次查看</div>' : '';
    
        resultPanel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <div style="color:#059669; font-weight:bold;">✅ 文本提取成功</div>
                <button class="btn-mini-copy" onclick="copyResultContent()">📋 一键复制</button>
            </div>
            
            ${burnHint}
            
            <div id="received-text-content" style="background:white; padding:12px; border-radius:8px; text-align:left; max-height:300px; overflow-y:auto; border:1px solid #e2e8f0; white-space: pre-wrap; font-family: monospace; color:#334155;"></div>
        `;
        document.getElementById('received-text-content').textContent = data.content;
    } else if (data.type === 'images') {
                const burnHint = data.burn ? '<div style="color:#ef4444; font-size:0.8rem; margin-bottom:10px;">🔥 此组图片加载后将立即销毁</div>' : '';
                resultPanel.innerHTML = `
                    <div style="color:#059669; font-weight:bold; margin-bottom:10px;">✅ 图片提取成功（${data.images.length} 张）</div>
                    ${burnHint}
                    <div id="received-image-grid" class="received-image-grid"></div>
                `;
                const grid = document.getElementById('received-image-grid');
                data.images.forEach(image => {
                    const card = document.createElement('div');
                    card.className = 'received-image-card';
                    const img = document.createElement('img');
                    img.src = image.downloadUrl;
                    img.alt = image.filename;
                    const name = document.createElement('div');
                    name.className = 'received-image-name';
                    name.textContent = image.filename;
                    const link = document.createElement('a');
                    link.href = image.downloadUrl;
                    link.download = image.filename;
                    link.textContent = '下载图片';
                    card.append(img, name, link);
                    grid.appendChild(card);
                });
            } else {
                const burnHint = data.burn ? '<div style="color:#ef4444; font-size:0.8rem; margin-bottom:5px;">🔥 此文件下载后将立即销毁</div>' : '';
                resultPanel.innerHTML = `
                    <div style="color:#059669; font-weight:bold;">✅ 文件提取成功</div>
                    ${burnHint}
                    <div style="margin:10px 0;">${data.filename}</div>
                    <a href="${data.downloadUrl}" target="_blank">
                        <button style="background:#10b981; color:white; border:none; padding:8px 20px; border-radius:6px; cursor:pointer;">⬇️ 下载文件</button>
                    </a>
                `;
            }
        } else {
            const shareUrl = `${window.location.origin}/?code=${data.code}`;
            const shareText = `【P2P快传】取件码：${data.code}，点击链接提取：${shareUrl} ⚠️ 注意：文件 2 小时后自动销毁，请尽快查看或下载。`;

            resultPanel.innerHTML = `
                <div style="color:#4b5563;">取件码 (${isBurn ? '🔥 阅后即焚' : '2小时有效'})</div>
                <div class="result-code" style="${isBurn ? 'color:#ef4444' : ''}">${data.code}</div>
                
                <div class="social-share-box">
                    <div class="social-title">快速分享给好友</div>
                    <div class="social-icons">
                        <button class="social-btn btn-wechat" onclick="toggleWechatQR()" title="微信分享">
                            <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M685.6 544.8c0-117.8-124.7-213.3-278.6-213.3S128.5 427 128.5 544.8c0 68.8 42.2 130.4 107.6 170.2l-26.8 82.2 100.3-51.5c30.3 8.3 62.8 12.8 96.4 12.8 3.2 0 6.3-0.1 9.5-0.2-2.7-12.7-4.1-25.7-4.1-39 0-116.9 126.4-211.7 282.4-211.7 0 12.4-3 24.5-8.2 37.2zM344.1 467.2c-19.2 0-34.7-15.5-34.7-34.7 0-19.2 15.5-34.7 34.7-34.7 19.2 0 34.7 15.5 34.7 34.7 0 19.2-15.5 34.7-34.7 34.7zm162.9 0c-19.2 0-34.7-15.5-34.7-34.7 0-19.2 15.5-34.7 34.7-34.7 19.2 0 34.7 15.5 34.7 34.7 0 19.2-15.5 34.7-34.7 34.7z"/><path d="M687.7 587.6c-132.9 0-240.6 93.4-240.6 208.5 0 115.1 107.7 208.5 240.6 208.5 28.6 0 56.3-5 82-14.3l74.9 40.9-20.1-66.3c55.7-34.2 91.6-86.7 91.6-145.4 0.1-115.1-107.6-208.5-240.5-208.5-2.7-0.1-5.3-0.1-7.9 0zM605.2 722.7c-13.7 0-24.8-11.1-24.8-24.8 0-13.7 11.1-24.8 24.8-24.8 13.7 0 24.8 11.1 24.8 24.8 0 13.7-11.1 24.8-24.8 24.8zm165 0c-13.7 0-24.8-11.1-24.8-24.8 0-13.7 11.1-24.8 24.8-24.8 13.7 0 24.8 11.1 24.8 24.8 0.1 13.7-11 24.8-24.8 24.8z"/></svg>
                        </button>
                        <button class="social-btn btn-qq" onclick="shareTo('qq', '${shareUrl}', '${shareText}')" title="分享到QQ">
                            <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M824.8 613.2c-16-51.4-34.4-94.6-62.7-165.3C766.5 262.2 689.3 112 511.5 112 331.7 112 256.2 265.2 261 447.9c-28.4 70.8-46.7 113.7-62.7 165.3-34 109.5-23 154.8-14.6 155.8 18 2.2 70.1-82.4 70.1-82.4 0 49 25.2 112.9 79.8 159-26.4 8.1-85.7 29.9-71.6 53.8 11.4 19.3 196.2 12.3 249.5 6.3 53.3 6 238.1 13 249.5-6.3 14.1-23.8-45.3-45.7-71.6-53.8 54.6-46.2 79.8-110.1 79.8-159 0 0 52.1 84.6 70.1 82.4 8.5-1.1 19.5-46.4-14.5-155.8z"/></svg>
                        </button>
                        <button class="social-btn btn-weibo" onclick="shareTo('weibo', '${shareUrl}', '${shareText}')" title="分享到微博">
                            <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M801.1 369.3c81-85.9 96.6-184.9 35.1-220.9-61.5-36-177 3.8-258 89-81 85.9-96.6 184.9-35.1 220.9 61.6 36 177-3.8 258-89zM534.6 531c-196.3 19.5-338.4 153.4-317.4 299 21 145.6 198.8 238 395.1 218.4 196.2-19.5 338.4-153.4 317.4-299-21-145.5-198.9-237.9-395.1-218.4zm-26.2 397.8c-134.5 12.2-254.5-58.5-268.1-157.8-13.6-99.3 85.5-190.3 220-202.5 134.4-12.2 254.5 58.5 268.1 157.8 13.5 99.3-85.5 190.3-220 202.5zm162.7-206.5c-30.7-67.9-124.6-95.6-198.1-57.9-8.9 4.6-15.5 12-16.1 21.1-0.9 13.5 10 24.4 22.8 24.8 5.4 0.2 10.4-1.9 14.1-5.3 45.5-35.5 110-19.2 129.8 24.7 17.6 38.8 1.3 87.2-39.7 114.7-5.3 3.6-8.5 9.2-8.3 15.3 0.4 10.2 6.7 18.8 15.6 21.9 4.1 1.4 8.5 1.4 12.8-0.1 66.3-24 94.6-94.9 67.1-159.2z"/><path d="M625 787.1c36.7-29.6 48-76.4 25.2-104.6-22.8-28.2-78-29.5-114.7 0.1-36.6 29.6-48 76.4-25.2 104.6 22.8 28.2 78 29.5 114.7-0.1zM538 754.2c-13.7-15.3-8.1-37.5 11-50.6 19-13.2 46.8-12.8 60.5 2.4 13.7 15.3 8 37.5-11 50.6-19 13.1-46.8 12.8-60.5-2.4z"/></svg>
                        </button>
                        <button class="social-btn btn-copy" onclick="copyText('${shareText}')" title="复制链接">
                            <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M720 192h-544A80.096 80.096 0 0 0 96 272v608C96 924.128 131.904 960 176 960h544c44.128 0 80-35.872 80-80V272c0-44.128-35.872-80-80-80z m16 768c0 8.8-7.2 16-16 16h-544a16.032 16.032 0 0 1-16-16V272c0-8.8 7.2-16 16-16h544c8.8 0 16 7.2 16 16v688z" /><path d="M848 64h-544C277.504 64 256 85.504 256 112v48c0 17.664 14.336 32 32 32s32-14.336 32-32V128h544v544h-32c-17.664 0-32 14.336-32 32s14.336 32 32 32h32c26.496 0 48-21.504 48-48V112c0-26.496-21.504-48-48-48z" /></svg>
                        </button>
                    </div>
                </div>

                <div id="qrcode-section" style="margin-top:15px; display:none; animation: fadeIn 0.3s;">
                    <div id="qrcode-container"></div>
                    <div style="font-size:0.8rem; color:#9ca3af; margin-top:5px;">微信扫一扫，直接分享</div>
                </div>
            `;
            const qrContainer = document.getElementById("qrcode-container");
            if (qrContainer) {
                new QRCode(qrContainer, {
                    text: shareUrl,
                    width: 120,
                    height: 120,
                    colorDark : "#000000",
                    colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.H
                });
            }
            if(window.innerWidth < 768) {
                const section = document.getElementById('qrcode-section');
                if(section) section.style.display = 'block';
            }
        }

    } catch (err) {
        resultPanel.style.display = 'block';
        resultPanel.innerHTML = `<div style="color:#ef4444; font-weight:bold;">❌ ${err.message}</div>`;
        if (currentMode === 'text') document.getElementById('input-text-val').focus();
        if (currentMode === 'receive') document.getElementById('input-code-val').focus();
    } finally {
        btn.disabled = false;
        if (currentMode === 'receive') btn.textContent = '立即提取';
        else btn.textContent = '生成接收码';
    }
}

// === 5. 辅助函数 ===
function toggleWechatQR() {
    const qrSection = document.getElementById('qrcode-section');
    if (qrSection) {
        if (qrSection.style.display === 'none') {
            qrSection.style.display = 'block';
            qrSection.scrollIntoView({ behavior: 'smooth' });
        } else {
            qrSection.style.display = 'none';
        }
    }
}

function shareTo(platform, url, title) {
    let shareLink = '';
    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(title);

    if (platform === 'weibo') {
        shareLink = `http://service.weibo.com/share/share.php?url=${encodedUrl}&title=${encodedTitle}`;
    } else if (platform === 'qq') {
        shareLink = `http://connect.qq.com/widget/shareqq/index.html?url=${encodedUrl}&title=${encodedTitle}&desc=P2P快传&summary=文件2小时过期`;
    }

    if (shareLink) {
        window.open(shareLink, '_blank', 'width=600,height=500');
    }
}

// [修改] 升级版复制功能：调用 copyToClipboard
async function copyText(text) {
    const success = await copyToClipboard(text);
    
    if (success) {
        // 视觉反馈：按钮变色
        const btn = document.querySelector('.btn-copy');
        if(btn) {
            const originalBg = btn.style.background;
            // 绿色渐变
            btn.style.background = 'linear-gradient(135deg, #059669 0%, #047857 100%)'; 
            setTimeout(() => {
                btn.style.background = originalBg; 
            }, 800);
        }
        
        // 弹出完成提示 Toast
        showToast("✅ 链接与取件码已复制！");
    } else {
        alert("复制失败，请手动复制");
    }
}

// [新增] 核心万能复制函数：兼容 HTTPS 和 HTTP
async function copyToClipboard(text) {
    // 方案 A: 优先使用现代 API (仅限 HTTPS 或 localhost)
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true; // 成功
        } catch (err) {
            console.warn('Clipboard API 失败，尝试降级方案:', err);
        }
    }

    // 方案 B: 降级使用 execCommand (兼容 HTTP)
    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        
        // 防止在移动端因为聚焦导致键盘弹出或页面滚动
        textarea.style.position = 'fixed'; 
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        textarea.setAttribute('readonly', '');
        
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, 99999); // 兼容 iOS
        
        const result = document.execCommand('copy');
        document.body.removeChild(textarea);
        
        if (result) return true;
    } catch (e) {
        console.error('复制失败:', e);
    }
    
    return false; // 彻底失败
}

// 通用 Toast 提示函数
function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    
    toast.style.cssText = `
        position: fixed;
        top: 30px;
        left: 50%;
        transform: translateX(-50%);
        background-color: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        opacity: 0;
        transition: opacity 0.3s ease, top 0.3s ease;
    `;
    
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.top = '50px'; 
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.top = '30px';
        setTimeout(() => {
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
            }
        }, 300);
    }, 2500);
}
// === [新增] 处理粘贴按钮点击 ===
async function handlePaste() {
    const textarea = document.getElementById('input-text-val');

    try {
        if (!window.isSecureContext || !navigator.clipboard?.readText) {
            throw new Error('Clipboard API unavailable');
        }

        const text = await navigator.clipboard.readText();

        if (!text) {
            showToast('⚠️ 剪贴板是空的');
            return;
        }

        textarea.value = text;
        showToast('✅ 已粘贴');
    } catch {
        textarea.focus();
        showToast('请长按文本框，选择“粘贴”');
    }
}

// === [新增] 接收结果页的一键复制 ===
function copyResultContent() {
    const contentBox = document.getElementById('received-text-content');
    if(contentBox) {
        copyText(contentBox.innerText);
    }
}
// === [新增] 接收文本后的复制按钮逻辑 ===
function copyResultContent() {
    // 获取显示文本的容器
    const contentBox = document.getElementById('received-text-content');
    
    if (contentBox) {
        // 调用之前写好的万能复制函数 copyToClipboard
        copyToClipboard(contentBox.innerText).then(success => {
            if (success) {
                showToast("✅ 已复制到剪贴板");
            } else {
                alert("复制失败，请手动选择复制");
            }
        });
    }
}

let imagePreviewUrls = [];

function updateImageSelection(input) {
    imagePreviewUrls.forEach(url => URL.revokeObjectURL(url));
    imagePreviewUrls = [];
    const files = Array.from(input.files || []);
    document.getElementById('image-name-display').textContent = files.length
        ? `已选择 ${files.length} 张图片`
        : '点击选择多张图片 或 拖拽至此';

    const grid = document.getElementById('image-preview-grid');
    grid.innerHTML = '';
    files.forEach(file => {
        const url = URL.createObjectURL(file);
        imagePreviewUrls.push(url);
        const img = document.createElement('img');
        img.src = url;
        img.alt = file.name;
        grid.appendChild(img);
    });
}
