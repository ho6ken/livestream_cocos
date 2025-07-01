import { _decorator, Camera, Component, director, error, Node, screen, size, Size, sys, UITransform, view, warn } from 'cc';
import Hls from 'hls.js';

const { ccclass, property } = _decorator;

/**
 * 
 * @summary 只支援web版本的非加密hls
 */
@ccclass
export class LiveVideoWeb extends Component {
    /**
     * 
     */
    private _video: HTMLVideoElement | null = null;

    /**
     * 
     */
    private _hls: Hls | null = null;

    /**
     * 
     */
    @property({ displayName: `影片url`, tooltip: `可為.m3u8串流` })
    private url: string = `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`;

    /**
     * 
     */
    private _camera: Camera | null = null;

    /**
     * 
     */
    protected onLoad(): void {
        // 只支援web
        if (sys.isNative || !sys.isBrowser) {
            return;
        }

        this._camera = director.getScene().getComponentInChildren(Camera);

        // 因瀏覽器要求自動播放時必須靜音, 因此改為以下做法
        // 點擊畫面時創建video player並開始播放
        document.body.addEventListener(`click`, this.onClick.bind(this), { once: true });

        // 校正顯示位置
        screen.on('window-resize', this.adjustVideo, this);
        screen.on('orientation-change', this.adjustVideo, this);
        screen.on('fullscreen-change', this.adjustVideo, this);
    }

    /**
     * 
     */
    protected onDestroy(): void {
        // event
        screen.off('window-resize', this.adjustVideo, this); 
        screen.off('orientation-change', this.adjustVideo, this); 
        screen.off('fullscreen-change', this.adjustVideo, this); 

        // hls
        if (Hls.isSupported()) {
            this._hls.off(Hls.Events.MANIFEST_PARSED, this.onParsed.bind(this));
            this._hls.off(Hls.Events.ERROR, this.onError.bind(this));
            this._hls.destroy();
        }
        // m3u8
        else if (this._video.canPlayType(`application/vnd.apple.mpegurl`)) {
            this._video.removeEventListener(`loadedmetadata`, this.onParsed.bind(this));
        }
    }

    /**
     * 創建video player
     */
    private createVideo(): void {
        this._video = document.createElement('video');
        this._video.style.position = 'absolute';
        this._video.style.pointerEvents = 'none';  // 避免擋住ui點擊
        this._video.style.zIndex = '999';
        this._video.style.backgroundColor = 'black';
        this._video.style.objectFit = 'cover';

        // 初始時先不顯示防止畫面閃動
        this._video.style.left = '0px';
        this._video.style.top = '0px';
        this._video.style.width = '0%';
        this._video.style.height = '0%';

        // 瀏覽器要求自動播放時必須靜音
        this._video.autoplay = false;
        this._video.muted = false;  

        this._video.controls = true;
        this._video.playsInline = true;

        document.body.appendChild(this._video);
    }

    /**
     * 校正video顯示位置
     */
    private adjustVideo(): void {
        if (!this._video || ! this._camera) {
            warn(`adjust video failed, video or camera is null.`);
            return;
        }

        let canvas = document.querySelector('canvas');

        if (!canvas) {
            warn(`adjust video failed, canvas is null.`);
            return;
        }

        let real = this.getRealSize(canvas);
        let design = view.getDesignResolutionSize();

        // 縮放倍率
        let scale = Math.max(
            real.width / design.width,
            real.height / design.height,
        );

        // 物件真實大小
        let node = this.getComponent(UITransform);
        let nodeW = node.width * scale;
        let nodeH = node.height * scale;

        let bound = canvas.getBoundingClientRect();
        let pos = this.node.getWorldPosition();

        // 新的左位置
        let left = bound.left;                   // 網頁左上
        left += (bound.width - real.width) / 2;  // canvas左上
        left += pos.x * scale - nodeW / 2;       // 物件在canvas中的位置

        // 新的上位置
        let top = bound.top;                      // 網頁左上
        top += (bound.height - real.height) / 2;  // canvas左上
        top += pos.y * scale - nodeH / 2;         // 物件在canvas中的位置

        // 重設顯示位置
        let style = this._video.style;
        style.left = `${left}px`;
        style.top = `${top}px`;
        style.width = `${nodeW}px`;
        style.height = `${nodeH}px`;
    }

    /**
     * 取得設計分辨率變化後的真實大小
     */
    private getRealSize(canvas: any): Size {
        let bound = canvas.getBoundingClientRect();
        let design = view.getDesignResolutionSize();

        // 縮放倍率
        let scale = Math.min(
            bound.width / design.width,
            bound.height / design.height,
        );

        return size(design.width * scale, design.height * scale);
    }

    /**
     * 播放video
     */
    private playVideo(url: string): void {
        this.url = url;

        if (!this._video) {
            error(`playe video failed, html video element is null.`, url);
            return;
        }

        // hls
        if (Hls.isSupported()) {
            this._hls = new Hls();
            this._hls.loadSource(url);
            this._hls.attachMedia(this._video);

            // event
            this._hls.on(Hls.Events.MANIFEST_PARSED, this.onParsed.bind(this));
            this._hls.on(Hls.Events.ERROR, this.onError.bind(this));
        }
        // m3u8
        else if (this._video.canPlayType(`application/vnd.apple.mpegurl`)) {
            this._video.src = url;
            this._video.addEventListener(`loadedmetadata`, this.onParsed.bind(this));
        }
        else {
            error(`play video failed, not support.`, url);
            return;
        }
    }

    /**
     * manifest解析完成
     */
    private onParsed(): void {
        this._video.play().catch(e => {
            error(`play video failed.`, e);
        });
    }

    /**
     * 播放錯誤
     */
    private onError(event: any, data: any): void {
        switch (data.type) {
            // 自動重連
            case Hls.ErrorTypes.NETWORK_ERROR:
                this._hls?.startLoad();
                warn(`hls play failed, start reconnecting.`, this.url);
                break;

            // 嘗試修復
            case Hls.ErrorTypes.MEDIA_ERROR:
                this._hls?.recoverMediaError();
                warn(`hls play failed, try recover media err.`, this.url);
                break;

            // 無法修復
            default:
                this._hls?.destroy();
                error(`hls play video faild, close hls.`, this.url, data.type);
                break;
        }
    }

    /**
     * 點擊畫面
     */
    private onClick(): void {
        this.createVideo();

        setTimeout(() => {
            this.url && this.playVideo(this.url);
            this.adjustVideo();
        }, 0);
    }
}
