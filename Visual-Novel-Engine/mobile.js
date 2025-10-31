// <<< 수정됨: const -> let으로 변경하고 초기 할당 제거
const canvas = document.getElementById('game'),
  ctx = canvas.getContext('2d'),
  image = new Image(), // 배경 이미지를 위한 전역 Image 객체
  httpRequest = new XMLHttpRequest();
  
let bgmAudio, sfxAudio; // DOM 로드 후 할당될 변수

let script,
  assetsDir = '',
  mousePos = { x: 0, y: 0 },
  isClick = false,
  isShiftDown = false,
  isSkipMode = false;

// <<< 추가됨: 게임 종료 상태 플래그
let gameEnded = false; 

let gameState = {
  currentScene: 'main',
  behaviorIndex: 0,
  backgroundImage: null,
  characters: [],
  bgmFile: null,
};
let executionInterrupted = false;

const uiButtons = {
  save: { x: 830, y: 10, width: 50, height: 30, text: '저장' },
  load: { x: 890, y: 10, width: 50, height: 30, text: '로드' },
  skip: { x: 770, y: 10, width: 50, height: 30, text: '스킵' }
};

// ====================================================================================================

// (confirm, alertErr, alert, preloading 함수는 변경 없음)
const confirm = (title, id, placeholder, func) => {
  Swal.fire({
    title: title,
    html:
      `<input id="${id}" style="font-size: 1.2rem; border-radius: .3125em; padding: 1rem; border: 1px solid #eee" placeholder="${placeholder}">`,
    focusConfirm: false,
    confirmButtonText: '확인'
  }).then((result) => {
    func(id, () => confirm(title, id, placeholder, func));
  });
}

const alertErr = (title, html = '') => {
  Swal.fire({
    title: title,
    html: html,
    focusConfirm: true,
    confirmButtonText: '확인'
  }).then(() => {
    window.location.reload()
  })
}

const alert = (title, html = '') => {
  Swal.fire({
    title: title,
    html: html,
    focusConfirm: true,
    confirmButtonText: '확인'
  })
}

const preloading = (dir, arr) => {
  assetsDir = dir;
  arr.forEach(e => {
    let img = new Image();
    img.src = assetsDir + e;
  });
}

// ====================================================================================================

// (프로토타입 및 헬퍼 함수들은 변경 없음)
CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  this.beginPath();
  this.moveTo(x + r, y);
  this.arcTo(x + w, y, x + w, y + h, r);
  this.arcTo(x + w, y + h, x, y + h, r);
  this.arcTo(x, y + h, x, y, r);
  this.arcTo(x, y, x + w, y, r);
  this.closePath();
  return this;
}

HTMLElement.prototype.getMousePos = function (event) {
  return new Promise((resolve) => {
    const rect = this.getBoundingClientRect();

    // event가 MouseEvent면 clientX/Y가 있고, Touch 객체면도 clientX/Y가 있습니다.
    const clientX = (event && event.clientX !== undefined) ? event.clientX
                    : (event && event.touches && event.touches[0] && event.touches[0].clientX) ? event.touches[0].clientX
                    : 0;
    const clientY = (event && event.clientY !== undefined) ? event.clientY
                    : (event && event.touches && event.touches[0] && event.touches[0].clientY) ? event.touches[0].clientY
                    : 0;

    // 화면(CSS) 상의 상대 좌표
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;

    // 캔버스의 내부 논리 해상도(속성 width/height)와
    // 실제 표시 크기(rect.width/height) 사이의 스케일 보정
    const scaleX = this.width && rect.width ? (this.width / rect.width) : 1;
    const scaleY = this.height && rect.height ? (this.height / rect.height) : 1;

    // 캔버스 내부 좌표계로 변환
    const x = Math.max(0, Math.min(this.width, Math.floor(cssX * scaleX)));
    const y = Math.max(0, Math.min(this.height, Math.floor(cssY * scaleY)));

    resolve({ x: x, y: y });
  });
}

const isInside = (pos, rect) => {
  return pos.x > rect.x && pos.x < rect.x + rect.width && pos.y < rect.y + rect.height && pos.y > rect.y
}

const wrapText = (context, text, x, y, maxWidth, lineHeight) => {
  let words = text.split(' ');
  let line = '';
  let currentY = y;

  for (let n = 0; n < words.length; n++) {
    let testLine = line + words[n] + ' ';
    let metrics = context.measureText(testLine);
    let testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      context.fillText(line, x, currentY);
      line = words[n] + ' ';
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  context.fillText(line, x, currentY);
}


// ====================================================================================================

const playScript = (json) => {
  if (!json) alert('존재하지 않는 스크립트입니다.');
  script = json;
  playScene('main');
};

const playScene = (name, startIndex = 0) => {
  return new Promise(async (resolve, reject) => {
    const scene = script[name];
    if (!scene) {
      alert(`장면 '${name}' 이 존재하지 않습니다.`);
      return reject();
    }
    
    executionInterrupted = false;
    gameState.currentScene = name;

    for (let i = startIndex; i < scene.length; i++) {
      // <<< 추가됨: 게임 종료 또는 로드 시 루프 중단
      if (executionInterrupted || gameEnded) {
          console.log("Execution halted.");
          return;
      }
      
      gameState.behaviorIndex = i;
      let behavior = scene[i];

      if (behavior.trigger && !eval(behavior.trigger)) continue;

      switch (behavior.type) {
        case 'conv':
          await playConv(behavior.contents);
          break;
        case 'ques':
          isSkipMode = false;
          await playQues(behavior.content, behavior.options);
          break;
        case 'scene':
          await playScene(behavior.name);
          break;
        case 'js':
          eval(behavior.scripts);
          break;
        case 'bgm':
          playBGM(behavior.file);
          break;
        case 'sfx':
          playSFX(behavior.file);
          break;
        // <<< 추가됨: 엔딩 타입 처리
        case 'ending':
          await playEnding(behavior);
          break;
        default:
          alert('정의되지 않은 type 값입니다.');
          break;
      }
    }
    if(!gameEnded) gameState.behaviorIndex++; // 씬이 정상적으로 끝나면 인덱스를 다음으로
    resolve();
  });
};

const playConv = (contents) => {
  return new Promise(async (resolve, reject) => {
    for (let content of contents) {
       if (executionInterrupted || gameEnded) return;
      await show(eval(`\`${content[0]}\``), content[1], content[2]);
      await waitUntilClick();
    }
    resolve();
  });
};

const playQues = (content, options) => {
  return new Promise(async (resolve, reject) => {
    const questionText = eval(`\`${content}\``);
    await show(questionText, undefined, [], false);

    await waitMillisecs(500);
    const index = await waitUntilChoose(questionText, options.answers);

    if (executionInterrupted || gameEnded) return;

    ctx.drawImage(image, 0, 0, 960, 540); 
    
    if (options.scripts) eval(options.scripts[index]);
    if (options.replies) {
      await show(...options.replies[index]); 
      await waitUntilClick();
    }
    if (options.scenes) await playScene(options.scenes[index]);
    resolve();
  });
};

// <<< 추가됨: 엔딩 처리 함수
const playEnding = (behavior) => {
  return new Promise(async (resolve) => {
    gameEnded = true;
    isSkipMode = false;

    // 엔딩 BGM 재생 (없으면 현재 BGM 중지)
    playBGM(behavior.bgm || null);

    // 엔딩 배경 이미지 로드
    let imageLoadedSuccessfully = false; // 이미지 로드 성공 여부 플래그 추가

    if (behavior.img) {
      const loadImageWithFallback = (filename, extension) => {
          return new Promise((res) => {
              image.src = `${assetsDir}${filename}.${extension}`;
              image.onload = () => res(true);
              image.onerror = () => res(false);
          });
      };
       let loaded = await loadImageWithFallback(behavior.img, 'png');
       if (!loaded) loaded = await loadImageWithFallback(behavior.img, 'jpg');
       
       imageLoadedSuccessfully = loaded; // 로드 성공 여부 기록
       if (!loaded) {
          console.warn(`엔딩 이미지 로드 실패: ${behavior.img}`);
          image.src = ''; // 로드 실패 시 image.src를 비워 broken 상태 방지
       }
    } else {
        image.src = ''; // 이미지가 없으면 src를 비워둠
    }

    const buttonRect = { x: (canvas.width - 200) / 2, y: canvas.height - 100, width: 200, height: 50 };

    const drawLoop = () => {
      // 배경 그리기 (image.src가 비어있거나, image.complete가 false일 수 있으므로, .complete 체크를 추가하거나 imageLoadedSuccessfully 플래그를 사용)
      // 현재 로직에서는 image.src = ''를 했으므로 image.src 체크로 충분
      if (image.src) { 
        ctx.drawImage(image, 0, 0, 960, 540);
      } else {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      
      // 엔딩 텍스트 그리기 (여러 줄 지원)
      ctx.fillStyle = 'white';
      ctx.font = '36px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = behavior.text.split('\n'); // \n으로 줄바꿈
      const lineHeight = 50;
      const startY = (canvas.height - (lines.length * lineHeight)) / 2;
      lines.forEach((line, index) => {
        ctx.fillText(line, canvas.width / 2, startY + (index * lineHeight));
      });

      // "타이틀로 돌아가기" 버튼 그리기
      const isHover = isInside(mousePos, buttonRect);
      ctx.fillStyle = isHover ? '#8EADFF' : '#658EFF';
      ctx.roundRect(buttonRect.x, buttonRect.y, buttonRect.width, buttonRect.height, 10).fill();
      ctx.fillStyle = 'white';
      ctx.font = '20px sans-serif';
      ctx.fillText('타이틀로 돌아가기', canvas.width / 2, buttonRect.y + buttonRect.height / 2);
      
      if (isClick) {
        if (isInside(mousePos, buttonRect)) {
           window.location.reload(); // 페이지 새로고침으로 타이틀 이동
           return;
        }
        isClick = false;
      }
      
      requestAnimationFrame(drawLoop);
    };

    drawLoop();
    // 이 Promise는 resolve되지 않아 스크립트 실행이 여기서 멈춥니다.
  });
};

const playBGM = (file) => {
  if (!bgmAudio) return;
  if (file) {
    const src = `${assetsDir}${file}`;
    if (!bgmAudio.src.endsWith(encodeURI(file))) {
      bgmAudio.src = src;
    }
    
    // play()는 Promise를 반환합니다.
    const playPromise = bgmAudio.play();
    if (playPromise !== undefined) {
      playPromise.catch(error => {
        // 자동 재생 정책 오류일 가능성이 높습니다.
        console.error("BGM 자동 재생 실패:", error);
        // 해결책: 다음 클릭 시 재생을 다시 시도하도록 리스너를 추가합니다.
        const playOnFirstClick = () => {
          bgmAudio.play().then(() => {
            console.log("사용자 상호작용 후 BGM 재생 성공.");
            // 성공하면 리스너를 제거하여 중복 실행을 방지합니다.
            window.removeEventListener('click', playOnFirstClick);
          }).catch(e => console.error("클릭 후에도 BGM 재생 실패:", e));
        };
        window.addEventListener('click', playOnFirstClick, { once: true }); // once 옵션으로 한번만 실행되게 할 수도 있습니다.
      });
    }

    gameState.bgmFile = file;
  } else {
    bgmAudio.pause();
    gameState.bgmFile = null;
  }
};

const playSFX = (file) => {
  if (!sfxAudio) return;
  if (file) {
    sfxAudio.src = `${assetsDir}${file}`;
    sfxAudio.play().catch(e => console.error("SFX 재생 실패:", e));
  }
};


const waitMillisecs = (ms) => {
  return new Promise(async (resolve) => {
    setTimeout(resolve, ms);
  });
}

const waitUntilClick = () => {
  return new Promise(async (resolve) => {
    if (isSkipMode) {
      resolve();
      return;
    }
    let loop = setInterval(() => {
      if (isClick) {
        resolve();
        isClick = false;
        clearInterval(loop);
      }
    }, 10);
  });
};

const waitUntilChoose = (question, answers) => {
  return new Promise(async (resolve, reject) => {
    let optionRects = [];
    let animationFrameId;

    for (let i = 0; i < answers.length; i++) {
        const h = 50;
        const y_padding = 20;
        const total_h = answers.length * h + (answers.length - 1) * y_padding;
        const start_y = (canvas.height - total_h) / 2;

        optionRects[i] = {
            x: (canvas.width - 600) / 2,
            y: start_y + i * (h + y_padding),
            width: 600,
            height: h
        };
    }
    
    const drawLoop = () => {
        ctx.drawImage(image, 0, 0, 960, 540);
        
        ctx.font = '28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 5;
        ctx.strokeText(question, canvas.width / 2, optionRects[0].y - 30);
        ctx.fillStyle = 'white';
        ctx.fillText(question, canvas.width / 2, optionRects[0].y - 30);

        for (let i = 0; i < answers.length; i++) {
            const rect = optionRects[i];
            
            if (isInside(mousePos, rect)) {
                ctx.fillStyle = '#8EADFF';
            } else {
                ctx.fillStyle = '#658EFF';
            }
            ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 10).fill();
            
            ctx.fillStyle = 'white';
            ctx.font = '20px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(answers[i], canvas.width / 2, rect.y + rect.height / 2);
        }

        drawUI();

        if (isClick) {
            checkUIClick(mousePos);
            if (executionInterrupted || gameEnded) {
                cancelAnimationFrame(animationFrameId);
                return;
            }

            for (let i = 0; i < answers.length; i++) {
                if (isInside(mousePos, optionRects[i])) {
                    isClick = false;
                    cancelAnimationFrame(animationFrameId);
                    resolve(i);
                    return;
                }
            }
            isClick = false;
        }
        
        animationFrameId = requestAnimationFrame(drawLoop);
    };

    drawLoop();
  });
}

const drawCharacters = (characterImages) => {
  if (!characterImages || characterImages.length === 0) return;

  if (characterImages.length === 1) {
    const char = characterImages[0];
    const x = (canvas.width - char.width) / 2;
    const y = canvas.height - char.height;
    ctx.drawImage(char, x, y, char.width, char.height);
  } 
  else if (characterImages.length >= 2) {
    const charLeft = characterImages[0];
    const charRight = characterImages[1];
    
    const x1 = 150;
    const y1 = canvas.height - charLeft.height;
    ctx.drawImage(charLeft, x1, y1, charLeft.width, charLeft.height);

    const x2 = canvas.width - charRight.width - 150;
    const y2 = canvas.height - charRight.height;
    ctx.drawImage(charRight, x2, y2, charRight.width, charRight.height);
  }
}

const show = (text, img, characters = [], smooth = true) => {
  return new Promise(async (resolve, reject) => {
    // <<< 수정 시작: 배경 이미지가 변경될 때만 새로 로드하도록 수정
    if (img && gameState.backgroundImage !== img) { // 현재 상태와 다를 때만!
      gameState.backgroundImage = img;
      const loadImageWithFallback = (filename, extension) => {
          return new Promise((res, rej) => {
              image.src = `${assetsDir}${filename}.${extension}`;
              image.onload = () => res(true);
              image.onerror = () => res(false);
          });
      };
      if (img.toLowerCase().endsWith('.png') || img.toLowerCase().endsWith('.jpg') || img.toLowerCase().endsWith('.jpeg')) {
          image.src = `${assetsDir}${img}`;
          await new Promise(r => image.onload = r);
      } else {
          let loaded = await loadImageWithFallback(img, 'png');
          if (!loaded) loaded = await loadImageWithFallback(img, 'jpg');
          if (!loaded) console.warn(`배경 이미지 로드 실패: ${img}`);
      }
    }
    // <<< 수정 끝

    gameState.characters = characters || [];
    const loadImage = (charName) => {
      return new Promise(async (res, rej) => {
        const charImg = new Image();
        const tryLoadChar = (filename, extension) => {
            return new Promise((resolveLoad) => {
                charImg.src = `${assetsDir}${filename}.${extension}`;
                charImg.onload = () => resolveLoad(true);
                charImg.onerror = () => resolveLoad(false);
            });
        };
        if (charName.toLowerCase().endsWith('.png') || charName.toLowerCase().endsWith('.jpg') || charName.toLowerCase().endsWith('.jpeg')) {
            charImg.src = `${assetsDir}${charName}`;
            charImg.onload = () => res(charImg);
            charImg.onerror = () => { console.error(`캐릭터 이미지 로드 실패: ${charName}`); res(null); };
        } else {
            let loaded = await tryLoadChar(charName, 'png');
            if (!loaded) loaded = await tryLoadChar(charName, 'jpg');
            if (loaded) res(charImg);
            else { console.error(`캐릭터 이미지 로드 실패: ${charName}`); res(null); }
        }
      });
    }
    const characterImagePromises = gameState.characters.map(loadImage);
    const loadedCharacterImages = (await Promise.all(characterImagePromises)).filter(img => img !== null);

    let talker = undefined;
    if (text && text.split(': ').length > 1) {
      const arr = text.split(': ');
      talker = arr.shift();
      text = arr.join(': ');
    } else {
      talker = nickname;
      text = '(' + text + ')';
    }

    const drawDialogueUI = (displayText) => {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.roundRect(40, 390, canvas.width - 80, 130, 10).fill();

        if (talker) showTalker(talker);

        ctx.fillStyle = 'white'
        ctx.font = '22px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const textY = talker ? 450 : 410;
        wrapText(ctx, displayText, 60, textY, canvas.width - 120, 30);
    }

    const drawScene = (displayText) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (image.src) {
        ctx.drawImage(image, 0, 0, 960, 540);
      } else {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      drawCharacters(loadedCharacterImages);
      if (text) {
        drawDialogueUI(displayText);
      }
      drawUI();
    }
    
    if (smooth && !isSkipMode && !isShiftDown) {
      for (let i = 1; i <= text.length; i++) {
        if (isClick || isShiftDown) {
          isClick = false;
          break;
        }
        drawScene(text.slice(0, i));
        await waitMillisecs(33);
      }
    }

    drawScene(text);
    resolve();
  });
}

const showTalker = (name) => {
  if (!name) return;
  ctx.font = '20px sans-serif'; // 너비 계산을 위해 폰트 먼저 설정
  const metrics = ctx.measureText(name);
  const textWidth = metrics.width + 40;
  
  ctx.fillStyle = '#658EFF';
  ctx.roundRect(50, 400, textWidth, 40, 5).fill();

  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 50 + textWidth / 2, 420);
}

const drawUI = () => {
  Object.values(uiButtons).forEach(button => {
    const isHover = isInside(mousePos, button);
    if (button.text === '스킵' && isSkipMode) {
        ctx.fillStyle = '#FF8E8E';
    } else {
        ctx.fillStyle = isHover ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0.7)';
    }
    ctx.roundRect(button.x, button.y, button.width, button.height, 5).fill();
    
    ctx.fillStyle = isHover ? '#333' : '#555';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(button.text, button.x + button.width / 2, button.y + button.height / 2);
  });
}

const checkUIClick = (pos) => {
  if (isInside(pos, uiButtons.save)) {
    showSaveScreen();
    isClick = false;
  } else if (isInside(pos, uiButtons.load)) {
    showLoadScreen();
    isClick = false;
  } else if (isInside(pos, uiButtons.skip)) {
    isSkipMode = !isSkipMode;
    console.log("Skip mode:", isSkipMode);
    if (isSkipMode) isClick = true; 
    else isClick = false;
  }
}

const showSaveScreen = () => {
    let slotHtml = '';
    for (let i = 1; i <= 5; i++) {
        const slotData = localStorage.getItem(`saveSlot_${i}`);
        const text = slotData ? new Date(JSON.parse(slotData).timestamp).toLocaleString() : '비어있음';
        slotHtml += `<button class="swal2-confirm swal2-styled" style="width: 80%; margin: 5px;" onclick="saveGame(${i})">슬롯 ${i}: ${text}</button><br>`;
    }
    Swal.fire({
        title: '저장하기',
        html: slotHtml,
        showConfirmButton: false
    });
};

const showLoadScreen = () => {
    let slotHtml = '';
    for (let i = 1; i <= 5; i++) {
        const slotData = localStorage.getItem(`saveSlot_${i}`);
        if (slotData) {
            const text = new Date(JSON.parse(slotData).timestamp).toLocaleString();
            slotHtml += `<button class="swal2-confirm swal2-styled" style="width: 80%; margin: 5px;" onclick="loadGame(${i})">슬롯 ${i}: ${text}</button><br>`;
        }
    }
     if (slotHtml === '') slotHtml = '<p>저장된 데이터가 없습니다.</p>';
    Swal.fire({
        title: '불러오기',
        html: slotHtml,
        showConfirmButton: false
    });
};

const saveGame = (slot) => {
  if (gameEnded || !gameState.currentScene) {
    alert("저장할 수 있는 상태가 아닙니다.");
    return;
  }
  const stateToSave = { ...gameState, timestamp: new Date().toISOString() };
  localStorage.setItem(`saveSlot_${slot}`, JSON.stringify(stateToSave));
  Swal.close();
  alert(`슬롯 ${slot}에 저장되었습니다.`);
};

const loadGame = async (slot) => {
  const savedData = localStorage.getItem(`saveSlot_${slot}`);
  if (savedData) {
    Swal.close();
    executionInterrupted = true;

    await waitMillisecs(100); 

    const loadedState = JSON.parse(savedData);
    gameState = loadedState;

    playBGM(gameState.bgmFile);
    
    await show('', gameState.backgroundImage, gameState.characters, false);
    
    playScene(gameState.currentScene, gameState.behaviorIndex);
  } else {
    alert(`슬롯 ${slot}에 저장된 데이터가 없습니다.`);
  }
};

// ====================================================================================================

window.addEventListener('DOMContentLoaded', () => {
  bgmAudio = document.getElementById('bgm-player');
  sfxAudio = document.getElementById('sfx-player');

  image.addEventListener('load', () => {
    ctx.drawImage(image, 0, 0, 960, 540);
  }, false);

  canvas.addEventListener('click', async event => {
    mousePos = await canvas.getMousePos(event);
    
    if (gameEnded) { // 게임이 끝났으면 버튼 클릭만 처리
      isClick = true;
      return;
    }

    let uiClicked = false;
    for(const button of Object.values(uiButtons)) {
        if(isInside(mousePos, button)) {
            uiClicked = true;
            break;
        }
    }

    if (uiClicked) {
        checkUIClick(mousePos);
    } else {
        isClick = true;
    }
  });

  canvas.addEventListener('mousemove', async event => {
      mousePos = await canvas.getMousePos(event);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      isClick = true;
    }
    if (event.key === 'Shift') {
      isShiftDown = true;
    }
  });

  window.addEventListener('keyup', (event) => {
    if (event.key === 'Shift') {
      isShiftDown = false;
    }
  });

  ctx.font = '24px sans-serif';
});