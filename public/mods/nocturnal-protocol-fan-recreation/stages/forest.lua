local growTime = 60
local maxScale = 6
local startTime = 10 

local growing = false
local appeared = false

local tinkyScale = 1
local tinkyScale2 = 1

local tinkyX = 800
local tinkyY = 1100
local tinkyStartScale = 1.2

local custardGrowTime = 18
local custardMaxScale = 2.3

local custardGrowing = false
local custardFalling = false

local custardScale = 0.3

local custardX = 990
local custardY = 1200

function onCreate()

    makeLuaSprite('forest', 'dayforest/forest', 44, 280)
    setScrollFactor('forest', 1.0, 1.0)
    scaleObject('forest', 2.0, 2.0)
    addLuaSprite('forest', false)

    makeAnimatedLuaSprite('tinkychase', 'characters/tinkyrun', tinkyX, tinkyY)

    addAnimationByPrefix('tinkychase', 'idle', 'idle', 24, false)
    addAnimationByPrefix('tinkychase', 'left', 'left', 24, false)
    addAnimationByPrefix('tinkychase', 'down', 'down', 24, false)
    addAnimationByPrefix('tinkychase', 'up', 'up', 24, false)
    addAnimationByPrefix('tinkychase', 'right', 'right', 24, false)

    scaleObject('tinkychase', tinkyStartScale, tinkyStartScale)

    addLuaSprite('tinkychase', false)

    setProperty('tinkychase.visible', false)

    playAnim('tinkychase', 'idle', true)

    makeAnimatedLuaSprite('tinkychase2', 'characters/tinkyrun', 350, 800)

    addAnimationByPrefix('tinkychase2', 'idle', 'idle', 24, false)
    addAnimationByPrefix('tinkychase2', 'left', 'left', 24, false)
    addAnimationByPrefix('tinkychase2', 'down', 'down', 24, false)
    addAnimationByPrefix('tinkychase2', 'up', 'up', 24, false)
    addAnimationByPrefix('tinkychase2', 'right', 'right', 24, false)

    scaleObject('tinkychase2', 1.5, 1.5)

    addLuaSprite('tinkychase2', false)

    setProperty('tinkychase2.visible', false)

    playAnim('tinkychase2', 'idle', true)

    makeLuaSprite('custard', 'dayforest/custard', custardX, custardY)

    setScrollFactor('custard', 1.0, 1.0)

    scaleObject('custard', custardScale, custardScale)

    setProperty('custard.visible', false)

    addLuaSprite('custard', false)
end

function onSongStart()

    makeLuaSprite('text', 'dayforest/text', 610, 10)
    setScrollFactor('text', 1.0, 1.0)
    scaleObject('text', 0.6, 0.6)

    setObjectCamera('text', 'other')

    addLuaSprite('text', true)
end

function onCreatePost()

    for i = 0,7 do
        setPropertyFromGroup('opponentStrums', i, 'visible', false)
    end

    setProperty('scoreTxt.visible', false)
    setProperty('timeTxt.visible', false)

    setProperty('iconP2.alpha', 0)
    setProperty('dad.alpha', 0)

    setProperty('boyfriend.alpha', 0)

    setProperty('boyfriend.scale.x', 1)
    setProperty('boyfriend.scale.y', 1)
end

function onStepHit()

    if curStep == 32 then
        removeLuaSprite('text', true)
    end

    if curStep == 318 then

        growing = false

        setProperty('boyfriend.scale.x', 1)
        setProperty('boyfriend.scale.y', 1)

        removeLuaSprite('forest', true)
    end

    if curStep == 335 then

        makeLuaSprite('forest2', 'dayforest/forest2', 95, 280)
        setScrollFactor('forest2', 1.0, 1.0)
        scaleObject('forest2', 2.0, 2.0)

        addLuaSprite('forest2', false)

        setProperty('iconP2.alpha', 1)
        setProperty('dad.alpha', 1)
    end

    if curStep == 608 then

        removeLuaSprite('forest2', true)
        
        setProperty('tinkychase.visible', true)

        setProperty('dad.alpha', 0)

        makeLuaSprite('screeneffect', 'screeneffect', 135, -20)
        setScrollFactor('screeneffect', 1.0, 1.0)
        scaleObject('screeneffect', 0.67, 0.5)

        setObjectCamera('screeneffect', 'other')

        addLuaSprite('screeneffect', true)
    end

    if curStep == 736 then
        makeLuaSprite('forest3', 'dayforest/forest3', 95, 280)
        setScrollFactor('forest3', 1.0, 1.0)
        scaleObject('forest3', 2.0, 2.0)
        setProperty('forest3.alpha', 0.2)
        
        addLuaSprite('forest3', false)
        
        setProperty('dad.alpha', 1)
        setProperty('tinkychase.visible', false)
        removeLuaSprite('screeneffect', true)
    end
    
    if curStep == 864 then
        removeLuaSprite('forest3', true)
        
        makeLuaSprite('forest4', 'dayforest/forest4', 95, 280)
        setScrollFactor('forest4', 1.0, 1.0)
        scaleObject('forest4', 2.0, 2.0)
        setProperty('forest4.alpha', 0.1)
        
        addLuaSprite('forest4', false)
        
        setProperty('boyfriend.alpha', 0)
    end
    
    if curStep == 896 then
        setProperty('boyfriend.alpha', 1)
        setProperty('dad.alpha', 0)
    end
    
    if curStep == 928 then
        setProperty('boyfriend.alpha', 0)
        setProperty('dad.alpha', 1)
    end

    if curStep == 960 then
        setProperty('boyfriend.alpha', 1)
        setProperty('dad.alpha', 0)
    end
    
    if curStep == 992 then
        removeLuaSprite('forest4', true)
        
        setProperty('iconP2.alpha', 0)
        
        makeLuaSprite('forest5', 'dayforest/forest5', 95, 280)
        setScrollFactor('forest5', 1.0, 1.0)
        scaleObject('forest5', 2.0, 2.0)
        setProperty('forest5.alpha', 0.2)
        
        addLuaSprite('forest5', false)
        
        setProperty('custard.visible', true)

        custardGrowing = true
        
        setProperty('boyfriend.alpha', 0)
    end
    
    if curStep == 1120 then
        setProperty('iconP2.alpha', 1)
        removeLuaSprite('forest5', true)
        setProperty('tinkychase2.visible', true)
        
        setProperty('tinkychase2.x', 100)
        setProperty('tinkychase2.y', 740)
        scaleObject('tinkychase2', 1.5, 1.5)
        
        setProperty('boyfriend.alpha', 1)
        
        makeLuaSprite('screeneffect', 'screeneffect', 135, -20)
        setScrollFactor('screeneffect', 1.0, 1.0)
        scaleObject('screeneffect', 0.67, 0.5)
        setObjectCamera('screeneffect', 'other')
        addLuaSprite('screeneffect', true)
    end
    
    if curStep == 1248 then
        setProperty('tinkychase2.visible', false)

        setProperty('boyfriend.alpha', 0)

        removeLuaSprite('screeneffect', true)
    end
end

function onUpdate(elapsed)

    local songPos = getSongPosition() / 1000

    if songPos >= startTime and not appeared then

        appeared = true
        growing = true

        doTweenAlpha('bfFadeIn', 'boyfriend', 1, 4, 'linear')
    end

    if growing and getProperty('boyfriend') ~= nil then

        local currentX = getProperty('boyfriend.scale.x')

        if currentX < maxScale then

            local step = (maxScale - 2) / growTime
            local newScale = currentX + step * elapsed

            if newScale > maxScale then
                newScale = maxScale
            end

            setProperty('boyfriend.scale.x', newScale)
            setProperty('boyfriend.scale.y', newScale)
        end
    end

    if getProperty('tinkychase.visible') then

        local hp = getProperty('health')

        local minScale = 0.6
        local maxScaleValue = 2.4

        local healthPercent = hp / 2

        local targetScale =
        maxScaleValue - ((maxScaleValue - minScale) * healthPercent)

        tinkyScale = tinkyScale + (targetScale - tinkyScale) * (elapsed * 5)

        local centerX = getProperty('tinkychase.x') + (getProperty('tinkychase.width') / 2)
        local centerY = getProperty('tinkychase.y') + (getProperty('tinkychase.height') / 2)

        scaleObject('tinkychase', tinkyStartScale * tinkyScale, tinkyStartScale * tinkyScale)

        setProperty('tinkychase.x', centerX - (getProperty('tinkychase.width') / 2))
        setProperty('tinkychase.y', centerY - (getProperty('tinkychase.height') / 2))
    end

    if getProperty('tinkychase2.visible') then

        local hp = getProperty('health')

        local minScale = 0.4
        local maxScaleValue = 1.85

        local healthPercent = hp / 2

        local targetScale =
        maxScaleValue - ((maxScaleValue - minScale) * healthPercent)

        tinkyScale2 = tinkyScale2 + (targetScale - tinkyScale2) * (elapsed * 5)

        local centerX = getProperty('tinkychase2.x') + (getProperty('tinkychase2.width') / 2)
        local centerY = getProperty('tinkychase2.y') + (getProperty('tinkychase2.height') / 2)

        scaleObject('tinkychase2', 1.5 * tinkyScale2, 1.5 * tinkyScale2 )

        setProperty('tinkychase2.x', centerX - (getProperty('tinkychase2.width') / 2))
        setProperty('tinkychase2.y', centerY - (getProperty('tinkychase2.height') / 2))
    end

    if custardGrowing then

        local currentScale = getProperty('custard.scale.x')

        if currentScale < custardMaxScale then

            local step = (custardMaxScale - 0.1) / custardGrowTime
            local newScale = currentScale + step * elapsed

            if newScale > custardMaxScale then
                newScale = custardMaxScale
            end

            setProperty('custard.scale.x', newScale)
            setProperty('custard.scale.y', newScale)

        else

            custardGrowing = false

            doTweenY('custardFall', 'custard', screenHeight + 2000, 1.3, 'cubeIn')
        end
    end
end

function opponentNoteHit(id, direction, noteType, isSustainNote)

    if not getProperty('tinkychase.visible') and not getProperty('tinkychase2.visible') then
        return
    end

    local chars = {'tinkychase', 'tinkychase2'}

    for i = 1,#chars do

        if getProperty(chars[i]..'.visible') then

            if direction == 0 then
                playAnim(chars[i], 'left', true)
            elseif direction == 1 then
                playAnim(chars[i], 'down', true)
            elseif direction == 2 then
                playAnim(chars[i], 'up', true)
            elseif direction == 3 then
                playAnim(chars[i], 'right', true)
            end
        end
    end
end

function onBeatHit()

    local chars = {'tinkychase', 'tinkychase2'}

    for i = 1,#chars do

        if getProperty(chars[i]..'.visible') then

            if getProperty(chars[i]..'.animation.curAnim.finished') then
                playAnim(chars[i], 'idle', true)
            end
        end
    end
end

function onTweenCompleted(tag)

    if tag == 'custardFall' then
        removeLuaSprite('custard', true)
    end
end