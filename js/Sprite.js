const canvas = document.querySelector('canvas');
const c = canvas.getContext('2d');

class Sprite {
    constructor({ position, imageSrc, scale = 1, maxFrames = 1, holdFrames = 30, offsetFrame = { x: 0, y: 0 } }) {
        this.position = position;
        this.height = 150;
        this.width = 50;
        this.image = new Image();
        this.image.src = imageSrc;
        this.scale = scale;
        this.maxFrames = maxFrames;     
        this.currentFrame = 0;          
        this.elapsedFrames = 0;         
        this.holdFrames = holdFrames;   
        this.offsetFrame = offsetFrame;
    }

    
    draw() {
        
        c.drawImage(this.image, this.currentFrame * (this.image.width / this.maxFrames), 0, this.image.width / this.maxFrames,
            this.image.height, this.position.x - this.offsetFrame.x, this.position.y - this.offsetFrame.y,
            (this.image.width / this.maxFrames) * this.scale, this.image.height * this.scale);
    }

    animateFrames() {
        this.elapsedFrames++;
        
        if (this.elapsedFrames % this.holdFrames === 0) {
            if (this.currentFrame < this.maxFrames - 1) {
                this.currentFrame++;    
            } else {
                if (this.hasOwnProperty('health')) { 
                    if (this.health > 0) {  
                        this.currentFrame = 0;  
                    }
                } else {
                    this.currentFrame = 0;  
                }
            }
        }
    }

    
    update() {
        this.draw();
        this.animateFrames();
    }
}

export const background = new Sprite({
    position: {
        x: 0,
        y: 0
    },
    imageSrc: '/assets/img/fight-bg.jpg',
    scale: 1.6,
    maxFrames: 1,
    holdFrames: 1,
    offsetFrame: { x: 0, y: 0 }
});

export default Sprite;