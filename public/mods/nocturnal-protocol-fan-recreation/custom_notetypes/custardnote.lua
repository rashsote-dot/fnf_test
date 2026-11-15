local custardCount = 0

local textX = 320
local textY = 600

function onCreate()

    makeAnimatedLuaSprite('guardianfinal', 'characters/guardianfinal', -200, 225)

    addAnimationByPrefix('guardianfinal', 'idle', 'idle', 24, true)
    addAnimationByPrefix('guardianfinal', 'walk', 'walk', 24, false)

    scaleObject('guardianfinal', 2.95, 2.95)

    setProperty('guardianfinal.visible', false)

    playAnim('guardianfinal', 'idle', true)

    if not luaTextExists('custardText') then
        makeLuaText('custardText', 'a player has collected 0/10 custards', 600, textX, textY)
        setTextAlignment('custardText', 'center')

        setObjectCamera('custardText', 'other')

        setTextSize('custardText', 28)
        setTextBorder('custardText', 2, '000000')
        addLuaText('custardText')
    end

    setProperty('custardText.alpha', 0)
end

function onCreatePost()
    for i = 0, getProperty('unspawnNotes.length')-1 do
        if getPropertyFromGroup('unspawnNotes', i, 'noteType') == 'CustardNote' then
            
            setPropertyFromGroup('unspawnNotes', i, 'texture', 'custard')
            setPropertyFromGroup('unspawnNotes', i, 'isSustainNote', false)

            setPropertyFromGroup('unspawnNotes', i, 'scale.x', 0.7)
            setPropertyFromGroup('unspawnNotes', i, 'scale.y', 0.7)

            setPropertyFromGroup('unspawnNotes', i, 'noAnimation', true)
        end
    end
end

function goodNoteHit(id, direction, noteType, isSustainNote)
    if noteType == 'CustardNote' then
        setProperty('health', getProperty('health') + 0.23)
        
        custardCount = custardCount + 1

        setTextString('custardText', 'a player has collected '..custardCount..'/10 custards')

        setProperty('custardText.alpha', 1)

        cancelTimer('hideCustardText')
        runTimer('hideCustardText', 2)
    end
end

function onStepHit()

    if curStep == 1248 then

        if custardCount == 10 then

            makeLuaSprite('goodEnding', 'endings/goodEnding', 95, 280)
            setScrollFactor('goodEnding', 1.0, 1.0)
            scaleObject('goodEnding', 2.0, 2.0)
            addLuaSprite('goodEnding', true)
            
            addLuaSprite('guardianfinal', true)
            
            setProperty('guardianfinal.visible', true)

            playAnim('guardianfinal', 'idle', true)

            setProperty('iconP2.alpha', 0)

        else

            makeLuaSprite('badEnding', 'endings/badEnding', 95, 280)
            setScrollFactor('badEnding', 1.0, 1.0)
            scaleObject('badEnding', 2.0, 2.0)
            addLuaSprite('badEnding', true)

            setProperty('iconP1.alpha', 0)

            setProperty('health', 0.01)

        end
    end
    
    if curStep == 1272 then

        if custardCount == 10 then
        
            playAnim('guardianfinal', 'walk', true)
            
        end
    end
end

function onUpdate()

    if getProperty('guardianfinal.animation.curAnim.name') == 'walk' then

        if getProperty('guardianfinal.animation.curAnim.finished') then
            removeLuaSprite('guardianfinal', true)
        end
    end
end

function onTimerCompleted(tag)
    if tag == 'hideCustardText' then
        setProperty('custardText.alpha', 0)
    end
end