import React, { useEffect, useRef } from 'react';

const PulseParticles = ({ intensity }) => {
    const canvasRef = useRef(null);
    const particles = useRef([]);
    const requestRef = useRef();

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const resize = () => {
            if (!canvas || !canvas.parentElement) return;
            canvas.width = canvas.parentElement.clientWidth;
            canvas.height = canvas.parentElement.clientHeight;
        };

        resize();
        window.addEventListener('resize', resize);

        class Particle {
            constructor() {
                this.reset();
            }

            reset() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.size = Math.random() * 2 + 1;
                this.speedX = (Math.random() - 0.5) * 0.5;
                this.speedY = (Math.random() - 0.5) * 0.5;
                this.opacity = Math.random() * 0.5;
                this.color = Math.random() > 0.5 ? '#7c3aed' : '#db2777';
            }

            update(intensity) {
                this.x += this.speedX * (1 + intensity / 10);
                this.y += this.speedY * (1 + intensity / 10);

                if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
                    this.reset();
                }

                if (intensity > 40) {
                    this.opacity = Math.min(1, this.opacity + 0.05);
                } else {
                    this.opacity = Math.max(0.1, this.opacity - 0.01);
                }
            }

            draw() {
                ctx.fillStyle = this.color;
                ctx.globalAlpha = this.opacity;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        const init = () => {
            particles.current = [];
            for (let i = 0; i < 50; i++) {
                particles.current.push(new Particle());
            }
        };

        init();

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            particles.current.forEach(p => {
                p.update(intensity);
                p.draw();
            });

            requestRef.current = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(requestRef.current);
        };
    }, [intensity]);

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 pointer-events-none z-0 opacity-40 mix-blend-screen"
        />
    );
};

export default PulseParticles;
