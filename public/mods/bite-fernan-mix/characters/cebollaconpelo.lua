--[[
local jump = true
enable = true

function onBeatHit()
	if curBeat >= 67 and curBeat % 1 == 0 and getProperty('boyfriend.animation.curAnim.name') == 'idle' and jump == true and enable == true then
		setProperty('boyfriend.y', 150)
		--setProperty('boyfriend.y', getProperty('boyfriend.y') + 50)
		doTweenY('raise', 'boyfriend', getProperty('boyfriend.y') - 60, 0.25, 'cubeOut')
		runTimer('down', 0.2)
	end
end

function onTimerCompleted(tag, loops, loopsLeft) -- penis
	if tag == 'down' then
		doTweenY('raise', 'boyfriend', 150, 0.25, 'cubeInOut')
	end
end

function noteMiss(membersIndex, noteData, noteType, isSustainNote)
	if mustHitSection == true then
		jump = false
	else
		jump = false
	end
end

function goodNoteHit(membersIndex, noteData, noteType, isSustainNote)
	if mustHitSection == true then
		jump = true
	else
		jump = true
	end
end
--]]